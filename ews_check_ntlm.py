"""
EWS connection test (NTLM) for the NexAI OTC mailbox connector.  Standalone, no DIGIT.

    python ews_check_ntlm.py

Everything is configured in the block below. The script installs its two packages if missing, then runs:
  1. TCP 443 to the EWS host          2. the server's advertised auth methods
  3. NTLM login (tries each account form in USERNAME_CANDIDATES until one is accepted)
  4. read the shared mailbox inbox    5. list the newest 5 mails
and prints a one-line verdict at the end.

SECURITY: this file contains the service-account password. Keep it only on the Nomura machine used for the
test, delete it afterwards, and rotate the password when the test is done. The password is never printed.
"""
import re, socket, subprocess, sys, time
from urllib.parse import urlparse

# =========================================== CONFIG ===========================================
EWS_URL  = "https://mummail.nomura.com/EWS/Exchange.asmx"
MAILBOX  = "testservicenowpoc@nomura.com"
PASSWORD = "CrFOJbP6w3<?"
# NTLM needs the account with its domain. The exact domain was not in the Exchange team's reply, so the
# script tries these forms in order and reports which one the server accepted. Put the right one first once known.
USERNAME_CANDIDATES = [
    "svcnewsd",                    # bare id (works when the server can resolve the default domain)
    "NOMURA\\svcnewsd",
    "nomura.com\\svcnewsd",
    "svcnewsd@nomura.com",         # UPN form
    "qaamericas\\svcnewsd",        # QA domain seen elsewhere at Nomura
    "americas\\svcnewsd",
    "emea\\svcnewsd",
    "asia\\svcnewsd",
]
NO_PROXY  = False   # set True if the machine has a corporate proxy that must be bypassed for this internal host
INSECURE  = False   # set True only for the test if the host uses an internal CA the machine does not trust
TIMEOUT   = 45
# ==============================================================================================


def ensure_packages():
    try:
        import requests, requests_ntlm  # noqa: F401
        return
    except ImportError:
        print("Installing the two required packages (requests, requests_ntlm) ...")
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "requests", "requests_ntlm"], check=False)
    try:
        import requests, requests_ntlm  # noqa: F401
    except ImportError:
        print("FAILED: could not install 'requests' and 'requests_ntlm'. Run:  pip install requests requests_ntlm"); sys.exit(1)


def main():
    ensure_packages()
    import requests
    from requests_ntlm import HttpNtlmAuth

    host = urlparse(EWS_URL).hostname
    verdict = []
    print("=" * 78)
    print(f"EWS endpoint : {EWS_URL}")
    print(f"Mailbox      : {MAILBOX}")
    print(f"Account forms: {', '.join(USERNAME_CANDIDATES)}")
    print("=" * 78)

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
        print("    (certificate validation disabled for this test)")

    # ---------------------------------------------------------------- 2. advertised auth methods
    def unauth_get(sess):
        return sess.get(EWS_URL, timeout=TIMEOUT)
    try:
        r = unauth_get(s)
    except requests.exceptions.SSLError as e:
        print(f"[2] TLS handshake                          FAILED: {str(e)[:120]}")
        print("    -> The host uses a certificate this machine does not trust (internal CA). Retrying with validation disabled for the test ...")
        s.verify = False; requests.packages.urllib3.disable_warnings(); verdict.append("internal CA: install Nomura's CA chain on the MID host")
        r = unauth_get(s)
    except requests.exceptions.ProxyError as e:
        print(f"[2] Proxy                                  FAILED: {str(e)[:120]}")
        print("    -> A proxy is in the way. Retrying with the proxy bypassed ...")
        s.trust_env = False; s.proxies = {"http": None, "https": None}; verdict.append("proxy must be bypassed for this host")
        r = unauth_get(s)
    except Exception as e:
        print(f"[2] Unauthenticated GET                    FAILED: {str(e)[:160]}")
        print("\nVERDICT: HOST REACHABLE BUT NO HTTP RESPONSE (proxy or TLS); set NO_PROXY / INSECURE in the CONFIG block and re-run"); sys.exit(1)
    www = r.headers.get("WWW-Authenticate", "(none)")
    print(f"[2] Advertised auth (HTTP {r.status_code})           {www}")
    if "NTLM" not in www.upper() and "NEGOTIATE" not in www.upper():
        print("    -> The server did not offer NTLM/Negotiate on this path; the login step may fail.")

    # ---------------------------------------------------------------- 3. NTLM login (try account forms)
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
    for cand in USERNAME_CANDIDATES:
        try:
            rr = s.post(EWS_URL, data=body_folder, headers=hdr, auth=HttpNtlmAuth(cand, PASSWORD), timeout=TIMEOUT)
        except Exception as e:
            print(f"[3] Login as {cand:<26} error: {str(e)[:90]}"); continue
        if rr.status_code == 401:
            print(f"[3] Login as {cand:<26} rejected (401)"); continue
        accepted, resp = cand, rr
        print(f"[3] Login as {cand:<26} ACCEPTED (HTTP {rr.status_code})")
        break
    if not accepted:
        print("    -> Every account form was rejected. Either the password is wrong or the domain is none of the candidates:")
        print("       ask the Exchange team for the exact DOMAIN\\svcnewsd form and put it first in USERNAME_CANDIDATES.")
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
    for v in verdict:
        print(f"NOTE   : {v}")
    print("NEXT   : the connector can be built on this path. Delete this file now and rotate the password after the test.")
    print("=" * 78)


if __name__ == "__main__":
    main()
