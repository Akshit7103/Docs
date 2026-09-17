"""
EWS connection test (NTLM) for the NexAI OTC mailbox connector.  Standalone, no DIGIT.

    python ews_check_ntlm.py

Everything is configured in the block below. The script installs its packages if missing, then runs:
  0.  finds the service account in Active Directory and reads its status (disabled / locked / expired / restrictions)
  0b. validates the password with a Windows logon check against the domain (native, no extra library, no MD4)
  1.  TCP 443 to the EWS host          2. the server's advertised auth methods
  3.  NTLM login to EWS                4. read the shared mailbox inbox      5. list the newest 5 mails
and prints a one-line verdict at the end.

Run it ONCE per password. Every rejected attempt counts against the account's bad-password threshold; do not loop it.

SECURITY: this file contains the service-account password. Keep it only on the Nomura machine used for the
test, delete it afterwards, and rotate the password when the test is done. The password is never printed.
"""
import ctypes, os, re, socket, subprocess, sys, time
from datetime import datetime, timedelta
from urllib.parse import urlparse

# =========================================== CONFIG ===========================================
EWS_URL  = "https://mummail.nomura.com/EWS/Exchange.asmx"
MAILBOX  = "testservicenowpoc@nomura.com"
ACCOUNT  = "svcnewsd"                    # sAMAccountName of the service account
PASSWORD = "CrFOJbP6w3<?"
DOMAIN   = "ASIAPAC"                     # NetBIOS domain found on 17-Sep (ASIAPAC.NOM); leave "" to discover again
# Fallback account forms, tried only if the domain is unknown and the directory lookup fails.
USERNAME_CANDIDATES = [
    "ASIAPAC\\svcnewsd", "svcnewsd@asiapac.nom", "APAC\\svcnewsd", "AMERICAS\\svcnewsd", "EUROPE\\svcnewsd",
    "JAPAN\\svcnewsd", "NOM\\svcnewsd", "NOMURA\\svcnewsd", "svcnewsd@nomura.com", "qaamericas\\svcnewsd", "svcnewsd",
]
NO_PROXY  = False   # set True if a corporate proxy must be bypassed for this internal host
INSECURE  = False   # set True only for the test if the host uses an internal CA (the script also retries by itself)
TIMEOUT   = 45
# ==============================================================================================

LOGON_ERRORS = {
    1326: "bad user name or PASSWORD (ERROR_LOGON_FAILURE)",
    1327: "account restriction: logon type or workstation not allowed for this account (ERROR_ACCOUNT_RESTRICTION)",
    1328: "outside permitted logon hours",
    1329: "this workstation is not allowed for the account (ERROR_INVALID_WORKSTATION)",
    1330: "PASSWORD EXPIRED",
    1331: "ACCOUNT DISABLED",
    1793: "ACCOUNT EXPIRED",
    1907: "password must be changed at next logon",
    1909: "ACCOUNT LOCKED OUT",
    1311: "no domain controller available to validate the logon",
    1355: "domain not found",
}


def ensure_packages():
    missing = []
    for mod, pkg in (("requests", "requests"), ("requests_ntlm", "requests_ntlm")):
        try: __import__(mod)
        except ImportError: missing.append(pkg)
    if missing:
        print(f"Installing required packages: {', '.join(missing)} ...")
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet"] + missing, check=False)
    for mod in ("requests", "requests_ntlm"):
        try: __import__(mod)
        except ImportError:
            print(f"FAILED: could not install '{mod}'. Run:  pip install requests requests_ntlm"); sys.exit(1)


def _filetime(v):
    try:
        v = int(v)
    except Exception:
        return None
    if v <= 0 or v >= 9223372036854775807:
        return None
    return datetime(1601, 1, 1) + timedelta(microseconds=v // 10)


def find_account():
    """Step 0: locate the account in AD (global catalog) and read its status. Returns (dns_domain, netbios, props)."""
    my_domain = os.environ.get("USERDNSDOMAIN", "").lower()
    if os.name != "nt" or not my_domain:
        print("[0] Domain lookup                          skipped (not a domain-joined Windows machine)")
        return None, None, {}
    ps = (f"$s=[adsisearcher]'(sAMAccountName={ACCOUNT})'; $s.SearchRoot=[adsi]'GC://{my_domain}'; "
          "$s.PropertiesToLoad.Add('distinguishedName') | Out-Null; $r=$s.FindOne(); if(-not $r){ 'NOTFOUND'; exit }; "
          "$dn=$r.Properties['distinguishedname'][0]; 'DN='+$dn; "
          "$t=[adsisearcher]'(objectClass=*)'; $t.SearchRoot=[adsi]('LDAP://'+$dn); $t.SearchScope='Base'; "
          "$t.PropertiesToLoad.AddRange(@('userAccountControl','lockoutTime','pwdLastSet','accountExpires','userWorkstations','memberOf','badPwdCount','lastLogonTimestamp')) | Out-Null; "
          "$x=$t.FindOne(); foreach($k in $x.Properties.PropertyNames){ if($k -ne 'adspath'){ $k+'='+(($x.Properties[$k] | ForEach-Object { $_ }) -join '|') } }")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True, timeout=90)
        text = (out.stdout or "") + (out.stderr or "")
    except Exception as e:
        print(f"[0] Domain lookup                          failed to run PowerShell: {e}")
        return None, None, {}
    props = {}
    for line in text.splitlines():
        line = line.strip()
        if "=" in line and not line.lower().startswith(("at line", "+ ")):
            k, _, v = line.partition("=")
            props[k.strip().lower()] = v.strip()
    dn = props.get("dn", "")
    if not dn:
        print(f"[0] Domain lookup (GC://{my_domain})        no result: {' '.join(text.split())[:140]}")
        return None, None, {}
    dcs = re.findall(r"DC=([^,]+)", dn, re.I)
    dns_domain, netbios = ".".join(dcs), (dcs[0].upper() if dcs else "")
    print(f"[0] Domain lookup                          {ACCOUNT} lives in {dns_domain}  ->  {netbios}\\{ACCOUNT}")
    print(f"    DN: {dn}")

    # account status
    flags = []
    try: uac = int(props.get("useraccountcontrol", "0"))
    except Exception: uac = 0
    if uac & 0x0002: flags.append("ACCOUNT DISABLED")
    if uac & 0x0010: flags.append("LOCKED OUT flag")
    if uac & 0x800000: flags.append("PASSWORD EXPIRED")
    if uac & 0x10000: flags.append("password never expires")
    if uac & 0x40000: flags.append("smartcard required (password logon impossible)")
    lock = _filetime(props.get("lockouttime", "0"))
    if lock: flags.append(f"lockoutTime set at {lock:%Y-%m-%d %H:%M} UTC (locked, or locked recently)")
    if props.get("pwdlastset", "") in ("0", ""): flags.append("pwdLastSet=0: must change password at next logon (NTLM/EWS will fail until changed)")
    exp = _filetime(props.get("accountexpires", "0"))
    if exp:
        flags.append(f"account expires {exp:%Y-%m-%d}" + (" (EXPIRED)" if exp < datetime.utcnow() else ""))
    if props.get("userworkstations"): flags.append(f"logon restricted to workstations: {props['userworkstations']}")
    if "protected users" in props.get("memberof", "").lower(): flags.append("member of Protected Users (NTLM NOT allowed)")
    if props.get("badpwdcount") not in (None, "", "0"): flags.append(f"badPwdCount={props['badpwdcount']} on this DC")
    last = _filetime(props.get("lastlogontimestamp", "0"))
    print(f"    Status: {'; '.join(flags) if flags else 'enabled, not locked, no restrictions seen'}"
          + (f"; last logon ~{last:%Y-%m-%d}" if last else ""))
    return dns_domain, netbios, props


def check_password_windows(netbios, dns_domain):
    """Step 0b: native Windows logon check (LogonUserW, network logon). Returns (ok, message)."""
    if os.name != "nt":
        return None, "skipped (not Windows)"
    adv = ctypes.WinDLL("advapi32", use_last_error=True)
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    tok = ctypes.c_void_p()
    ok = adv.LogonUserW(ACCOUNT, netbios or None, PASSWORD, 3, 0, ctypes.byref(tok))   # 3 = LOGON32_LOGON_NETWORK
    if ok:
        k32.CloseHandle(tok)
        return True, f"PASSWORD OK (domain {netbios} validated the credentials)"
    err = ctypes.get_last_error()
    return False, f"rejected: {LOGON_ERRORS.get(err, 'Windows error ' + str(err))}"


def main():
    ensure_packages()
    import requests
    from requests_ntlm import HttpNtlmAuth

    host = urlparse(EWS_URL).hostname
    notes = []
    print("=" * 78)
    print(f"EWS endpoint : {EWS_URL}\nMailbox      : {MAILBOX}\nAccount      : {ACCOUNT}")
    print("=" * 78)

    # ---------------------------------------------------------------- 0 / 0b. directory: account status + password
    dns_domain, netbios, props = find_account()
    if not netbios and DOMAIN:
        netbios, dns_domain = DOMAIN.upper(), (dns_domain or DOMAIN.lower() + ".nom")
        print(f"[0] Domain                                 using configured DOMAIN={netbios}")
    if netbios:
        forms = [f"{netbios}\\{ACCOUNT}", f"{ACCOUNT}@{dns_domain}"]   # only the two real forms: no lockout risk
    else:
        forms = list(USERNAME_CANDIDATES)

    pw_ok, msg = check_password_windows(netbios, dns_domain)
    print(f"[0b] Windows logon check as {(netbios or '?') + chr(92) + ACCOUNT:<20} {msg}")
    if pw_ok is False:
        if "1326" in msg or "ERROR_LOGON_FAILURE" in msg:
            print("    -> The domain rejects this password. Do NOT re-run repeatedly (lockout). Get the password re-confirmed / reset by the Exchange team.")
            notes.append("password rejected by the domain")
        else:
            print("    -> The account state blocks the logon (see above). The Exchange/AD team must fix the account before EWS can work.")
            notes.append("account state blocks logon")

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

    if pw_ok is False:
        print("[3] EWS login                              skipped: the domain already rejected the credentials (no point burning attempts)")
        print(f"\nVERDICT: NETWORK OK, CREDENTIALS REJECTED BY THE DOMAIN ({msg})"); sys.exit(2)

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
        if pw_ok:
            print("    -> The domain accepts the password, but EWS rejects the same credentials over NTLM. Causes: NTLM disabled for this account or")
            print("       for the EWS virtual directory, the account blocked from Exchange (CAS mailbox policy), or a proxy stripping the auth.")
            print(f"\nVERDICT: PASSWORD OK, EWS LOGIN REFUSED -> ask the Exchange team to allow NTLM/EWS for {netbios}\\{ACCOUNT}"); sys.exit(2)
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
