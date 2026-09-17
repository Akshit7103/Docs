"""
EWS connection test (NTLM) for the NexAI OTC mailbox connector.  Standalone, no DIGIT.

    python ews_check_ntlm.py

Everything is configured in the block below. The script installs its packages if missing, then runs:
  0. finds the domain of the service account in Active Directory (uses the machine's logged-in session, no password)
  0b. validates the password with an LDAP bind to that domain (independent of EWS)
  1. TCP 443 to the EWS host          2. the server's advertised auth methods
  3. NTLM login to EWS (confirmed form first, then the candidates)
  4. read the shared mailbox inbox    5. list the newest 5 mails
and prints a one-line verdict at the end.

SECURITY: this file contains the service-account password. Keep it only on the Nomura machine used for the
test, delete it afterwards, and rotate the password when the test is done. The password is never printed.
"""
import os, re, socket, subprocess, sys, time
from urllib.parse import urlparse

# =========================================== CONFIG ===========================================
EWS_URL  = "https://mummail.nomura.com/EWS/Exchange.asmx"
MAILBOX  = "testservicenowpoc@nomura.com"
ACCOUNT  = "svcnewsd"                    # sAMAccountName of the service account
PASSWORD = "CrFOJbP6w3<?"
# Fallback account forms, tried only if the directory lookup cannot determine the domain.
USERNAME_CANDIDATES = [
    "ASIAPAC\\svcnewsd", "svcnewsd@asiapac.nom", "APAC\\svcnewsd", "AMERICAS\\svcnewsd", "EUROPE\\svcnewsd",
    "JAPAN\\svcnewsd", "NOM\\svcnewsd", "NOMURA\\svcnewsd", "svcnewsd@nomura.com", "qaamericas\\svcnewsd", "svcnewsd",
]
NO_PROXY  = False   # set True if a corporate proxy must be bypassed for this internal host
INSECURE  = False   # set True only for the test if the host uses an internal CA (the script also retries by itself)
TIMEOUT   = 45
# ==============================================================================================


def ensure_packages():
    missing = []
    for mod, pkg in (("requests", "requests"), ("requests_ntlm", "requests_ntlm"), ("ldap3", "ldap3")):
        try: __import__(mod)
        except ImportError: missing.append(pkg)
    if missing:
        print(f"Installing required packages: {', '.join(missing)} ...")
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet"] + missing, check=False)
    for mod in ("requests", "requests_ntlm", "ldap3"):
        try: __import__(mod)
        except ImportError:
            print(f"FAILED: could not install '{mod}'. Run:  pip install requests requests_ntlm ldap3"); sys.exit(1)


def find_domain():
    """Step 0: ask Active Directory (global catalog) where the account lives. Returns (dns_domain, netbios) or (None, None)."""
    my_domain = os.environ.get("USERDNSDOMAIN", "").lower()
    if os.name != "nt" or not my_domain:
        print("[0] Domain lookup                          skipped (not a domain-joined Windows machine)")
        return None, None
    ps = (f"$s=[adsisearcher]'(sAMAccountName={ACCOUNT})'; $s.SearchRoot=[adsi]'GC://{my_domain}'; "
          "$s.PropertiesToLoad.Add('distinguishedName') | Out-Null; $r=$s.FindAll(); "
          "foreach($x in $r){ $x.Properties['distinguishedname'][0] }")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True, timeout=60)
        text = (out.stdout or "") + (out.stderr or "")
    except Exception as e:
        print(f"[0] Domain lookup                          failed to run PowerShell: {e}")
        return None, None
    dn = next((line.strip() for line in text.splitlines() if "DC=" in line), "")
    if not dn:
        print(f"[0] Domain lookup (GC://{my_domain})        no result{(': ' + ' '.join(text.split())[:120]) if text.strip() else ''}")
        return None, None
    dcs = re.findall(r"DC=([^,]+)", dn, re.I)
    dns_domain = ".".join(dcs)
    netbios = dcs[0].upper() if dcs else ""
    print(f"[0] Domain lookup                          {ACCOUNT} lives in {dns_domain}  ->  {netbios}\\{ACCOUNT}")
    print(f"    DN: {dn}")
    return dns_domain, netbios


def check_password_ldap(dns_domain, forms):
    """Step 0b: NTLM bind to the domain's LDAP with the password. Returns the first form that binds, or None."""
    from ldap3 import Server, Connection, NTLM
    server = Server(dns_domain, port=389, get_info=None, connect_timeout=15)
    for form in forms:
        if "\\" not in form:
            continue   # ldap3 NTLM needs DOMAIN\\user
        try:
            conn = Connection(server, user=form, password=PASSWORD, authentication=NTLM, receive_timeout=20)
            ok = conn.bind()
            reason = "" if ok else str(conn.result.get("description", "") + " " + conn.result.get("message", ""))[:80]
            conn.unbind()
        except Exception as e:
            ok, reason = False, str(e)[:80]
        print(f"[0b] LDAP bind as {form:<24} {'PASSWORD OK' if ok else 'rejected' + ((' (' + reason.strip() + ')') if reason.strip() else '')}")
        if ok:
            return form
    return None


def main():
    ensure_packages()
    import requests
    from requests_ntlm import HttpNtlmAuth

    host = urlparse(EWS_URL).hostname
    notes = []
    print("=" * 78)
    print(f"EWS endpoint : {EWS_URL}\nMailbox      : {MAILBOX}\nAccount      : {ACCOUNT}")
    print("=" * 78)

    # ---------------------------------------------------------------- 0 / 0b. directory: domain + password
    dns_domain, netbios = find_domain()
    forms = list(USERNAME_CANDIDATES)
    if netbios:
        forms = [f"{netbios}\\{ACCOUNT}", f"{ACCOUNT}@{dns_domain}"] + [f for f in forms if f.lower() not in (f"{netbios}\\{ACCOUNT}".lower(), f"{ACCOUNT}@{dns_domain}".lower())]
    ldap_domain = dns_domain or os.environ.get("USERDNSDOMAIN", "").lower()
    password_ok_form = None
    if ldap_domain:
        password_ok_form = check_password_ldap(ldap_domain, forms[:4] if netbios else forms)
        if password_ok_form:
            forms = [password_ok_form] + [f for f in forms if f != password_ok_form]
        elif netbios:
            print(f"    -> The account exists in {dns_domain} but the password did not bind: the password is wrong (or the account is locked/disabled).")
            notes.append("password rejected by the domain: confirm the EWS password for svcnewsd with the Exchange team")
    else:
        print("[0b] LDAP password check                   skipped (no domain known)")

    # ---------------------------------------------------------------- 1. network
    t0 = time.time()
    try:
        socket.create_connection((host, 443), timeout=10).close()
        print(f"[1] TCP 443 to {host:<28} OK  ({int((time.time()-t0)*1000)} ms)")
    except Exception as e:
        print(f"[1] TCP 443 to {host:<28} FAILED: {e}")
        print("    -> Not reachable from this machine. A firewall/proxy rule is needed from this zone (and from the MID host) to the host on 443.")
        print("\nVERDICT: NETWORK BLOCKED"); sys.exit(1)

    # ---------------------------------------------------------------- session (proxy / TLS handling)
    s = requests.Session()
    if NO_PROXY:
        s.trust_env = False; s.proxies = {"http": None, "https": None}
    if INSECURE:
        s.verify = False; requests.packages.urllib3.disable_warnings()

    # ---------------------------------------------------------------- 2. advertised auth methods
    def unauth_get(sess): return sess.get(EWS_URL, timeout=TIMEOUT)
    try:
        r = unauth_get(s)
    except requests.exceptions.SSLError:
        print("[2] TLS handshake                          internal CA (certificate not trusted here); continuing with validation disabled for the test")
        s.verify = False; requests.packages.urllib3.disable_warnings(); notes.append("internal CA: install Nomura's CA chain on the MID host")
        r = unauth_get(s)
    except requests.exceptions.ProxyError:
        print("[2] Proxy                                  a proxy is in the way; retrying with the proxy bypassed")
        s.trust_env = False; s.proxies = {"http": None, "https": None}; notes.append("proxy must be bypassed for this host")
        r = unauth_get(s)
    except Exception as e:
        print(f"[2] Unauthenticated GET                    FAILED: {str(e)[:160]}")
        print("\nVERDICT: HOST REACHABLE BUT NO HTTP RESPONSE (proxy or TLS); set NO_PROXY / INSECURE in CONFIG and re-run"); sys.exit(1)
    www = r.headers.get("WWW-Authenticate", "(none)")
    print(f"[2] Advertised auth (HTTP {r.status_code})           {www}")

    # ---------------------------------------------------------------- 3. NTLM login to EWS
    body_folder = (
        '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" '
        'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
        '<s:Header><t:RequestServerVersion Version="Exchange2013_SP1"/></s:Header><s:Body>'
        '<m:GetFolder><m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape><m:FolderIds>'
        f'<t:DistinguishedFolderId Id="inbox"><t:Mailbox><t:EmailAddress>{MAILBOX}</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>'
        '</m:FolderIds></m:GetFolder></s:Body></s:Envelope>'
    )
    hdr = {"Content-Type": "text/xml; charset=utf-8"}
    accepted, resp = None, None
    for cand in forms:
        try:
            rr = s.post(EWS_URL, data=body_folder, headers=hdr, auth=HttpNtlmAuth(cand, PASSWORD), timeout=TIMEOUT)
        except Exception as e:
            print(f"[3] EWS login as {cand:<24} error: {str(e)[:90]}"); continue
        if rr.status_code == 401:
            print(f"[3] EWS login as {cand:<24} rejected (401)"); continue
        accepted, resp = cand, rr
        print(f"[3] EWS login as {cand:<24} ACCEPTED (HTTP {rr.status_code})")
        break
    if not accepted:
        if password_ok_form:
            print(f"    -> The domain accepted the password for {password_ok_form}, but EWS rejects it: NTLM to EWS is not allowed for this account, or the")
            print("       EWS virtual directory expects a different auth for it. Ask the Exchange team to confirm NTLM/EWS access for svcnewsd.")
            print(f"\nVERDICT: PASSWORD OK ({password_ok_form}), EWS LOGIN REFUSED"); sys.exit(2)
        print("    -> Every form was rejected. Confirm the password and the DOMAIN\\svcnewsd form with the Exchange team.")
        print("\nVERDICT: NETWORK OK, LOGIN FAILED"); sys.exit(2)

    # ---------------------------------------------------------------- 4. mailbox inbox
    code = (re.search(r"ResponseCode>([^<]+)<", resp.text) or [None, "?"])[1]
    if code != "NoError":
        print(f"[4] Inbox of {MAILBOX:<28} EWS refused: {code}")
        if "AccessDenied" in code or "FolderNotFound" in code:
            print("    -> The account authenticates but has no Full Access on this mailbox yet: ask the Exchange team to grant it.")
        elif "NonExistentMailbox" in code:
            print("    -> Mailbox address not found on this Exchange organisation.")
        print(f"\nVERDICT: LOGIN OK AS {accepted}, MAILBOX ACCESS FAILED ({code})"); sys.exit(3)
    total = (re.search(r"TotalCount>(\d+)<", resp.text) or [None, "?"])[1]
    unread = (re.search(r"UnreadCount>(\d+)<", resp.text) or [None, "?"])[1]
    print(f"[4] Inbox of {MAILBOX:<28} readable: {total} item(s), {unread} unread")

    # ---------------------------------------------------------------- 5. newest mails
    body_items = (
        '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" '
        'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
        '<s:Header><t:RequestServerVersion Version="Exchange2013_SP1"/></s:Header><s:Body>'
        '<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
        '<t:FieldURI FieldURI="item:Subject"/><t:FieldURI FieldURI="item:DateTimeReceived"/><t:FieldURI FieldURI="message:From"/>'
        '</t:AdditionalProperties></m:ItemShape><m:IndexedPageItemView MaxEntriesReturned="5" Offset="0" BasePoint="Beginning"/>'
        '<m:SortOrder><t:FieldOrder Order="Descending"><t:FieldURI FieldURI="item:DateTimeReceived"/></t:FieldOrder></m:SortOrder>'
        f'<m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"><t:Mailbox><t:EmailAddress>{MAILBOX}</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId></m:ParentFolderIds>'
        '</m:FindItem></s:Body></s:Envelope>'
    )
    try:
        ri = s.post(EWS_URL, data=body_items, headers=hdr, auth=HttpNtlmAuth(accepted, PASSWORD), timeout=TIMEOUT)
        items = re.findall(r"<t:Message>(.*?)</t:Message>", ri.text, re.S)
        print(f"[5] Newest {len(items)} mail(s):")
        for it in items:
            subj = (re.search(r"<t:Subject>(.*?)</t:Subject>", it, re.S) or [None, "(no subject)"])[1]
            when = (re.search(r"<t:DateTimeReceived>(.*?)</t:DateTimeReceived>", it) or [None, ""])[1]
            frm = (re.search(r"<t:EmailAddress>(.*?)</t:EmailAddress>", it) or [None, ""])[1]
            print(f"    {when[:19]:<20} {frm[:34]:<36} {subj[:60]}")
    except Exception as e:
        print(f"[5] Listing mails                          skipped: {str(e)[:100]}")

    # ---------------------------------------------------------------- verdict
    print("\n" + "=" * 78)
    print(f"VERDICT: SUCCESS - network, NTLM login (as {accepted}) and mailbox rights all work from this machine.")
    for n in notes:
        print(f"NOTE   : {n}")
    print("NEXT   : the connector can be built on this path. Delete this file now and rotate the password after the test.")
    print("=" * 78)


if __name__ == "__main__":
    main()
