#!/usr/bin/env python3
"""List Contabo instance IDs and addresses without persisting API credentials."""

import getpass
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

AUTH_URL = "https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token"
INSTANCES_URL = "https://api.contabo.com/v1/compute/instances"
FIREWALLS_URL = "https://api.contabo.com/v1/firewalls"
PAGE_SIZE = 10


def api_request(url, access_token):
    return urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
            "X-Request-Id": str(uuid.uuid4()),
        },
    )


def request_json(request):
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Contabo API request failed with HTTP {error.code}.") from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not connect to the Contabo API: {error.reason}") from error
    except TimeoutError as error:
        raise RuntimeError("The Contabo API request timed out.") from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Contabo API returned an invalid JSON response.") from error

    if not isinstance(payload, dict):
        raise RuntimeError("Contabo API returned an unexpected response.")
    return payload


def get_access_token(client_id, client_secret, api_user, api_password):
    form = urllib.parse.urlencode(
        {
            "grant_type": "password",
            "client_id": client_id,
            "client_secret": client_secret,
            "username": api_user,
            "password": api_password,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        AUTH_URL,
        data=form,
        headers={"Accept": "application/json"},
        method="POST",
    )
    payload = request_json(request)
    token = payload.get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Contabo authentication response did not contain an access token.")
    return token


def list_instances(access_token):
    instances = []
    seen_instance_ids = set()
    page = 1

    while True:
        query = urllib.parse.urlencode({"page": page, "size": PAGE_SIZE})
        request = urllib.request.Request(
            f"{INSTANCES_URL}?{query}",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
                "X-Request-Id": str(uuid.uuid4()),
            },
        )
        payload = request_json(request)
        data = payload.get("data")
        if not isinstance(data, list):
            raise RuntimeError("Contabo instance-list response did not contain an instance list.")

        for instance in data:
            if not isinstance(instance, dict) or instance.get("instanceId") is None:
                raise RuntimeError("Contabo returned an instance without an instanceId.")
            instance_id = instance["instanceId"]
            if instance_id in seen_instance_ids:
                raise RuntimeError("Contabo repeated an instance while paginating the response.")
            seen_instance_ids.add(instance_id)

        instances.extend(data)
        if len(data) < PAGE_SIZE:
            return instances
        if page >= 100:
            raise RuntimeError("Contabo returned more than 100 pages of instances; narrow the query before continuing.")
        page += 1


def list_firewalls(access_token):
    firewalls = []
    seen_firewall_ids = set()
    page = 1

    while True:
        query = urllib.parse.urlencode({"page": page, "size": PAGE_SIZE})
        payload = request_json(api_request(f"{FIREWALLS_URL}?{query}", access_token))
        data = payload.get("data")
        if not isinstance(data, list):
            raise RuntimeError("Contabo firewall-list response did not contain a firewall list.")

        for firewall in data:
            if not isinstance(firewall, dict) or firewall.get("firewallId") is None:
                raise RuntimeError("Contabo returned a firewall without a firewallId.")
            firewall_id = firewall["firewallId"]
            if firewall_id in seen_firewall_ids:
                raise RuntimeError("Contabo repeated a firewall while paginating the response.")
            seen_firewall_ids.add(firewall_id)

        firewalls.extend(data)
        if len(data) < PAGE_SIZE:
            return firewalls
        if page >= 100:
            raise RuntimeError("Contabo returned more than 100 pages of firewalls; narrow the query before continuing.")
        page += 1


def address_for_family(ip_config, family):
    family_config = ip_config.get(family) or {}
    if not isinstance(family_config, dict):
        return ""
    return family_config.get("ip") or ""


def main():
    client_id = input("Contabo API client ID: ").strip()
    client_secret = getpass.getpass("Contabo API client secret: ")
    api_user = input("Contabo API user: ").strip()
    api_password = getpass.getpass("Contabo API password: ")
    if not all((client_id, client_secret, api_user, api_password)):
        print("All four Contabo API credentials are required.", file=sys.stderr)
        return 2

    try:
        token = get_access_token(client_id, client_secret, api_user, api_password)
        instances = list_instances(token)
        firewalls = list_firewalls(token)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    print("instanceId\tname\tdisplayName\tIPv4\tIPv6")
    for instance in instances:
        ip_config = instance.get("ipConfig") or {}
        if not isinstance(ip_config, dict):
            ip_config = {}
        print(
            "{}\t{}\t{}\t{}\t{}".format(
                instance.get("instanceId", ""),
                instance.get("name") or "",
                instance.get("displayName") or "",
                address_for_family(ip_config, "v4"),
                address_for_family(ip_config, "v6"),
            )
        )

    print("\nfirewallId\tname\tstatus\tinstances\trules")
    for firewall in firewalls:
        instances_json = json.dumps(firewall.get("instances") or [], separators=(",", ":"), sort_keys=True)
        rules_json = json.dumps(firewall.get("rules") or {}, separators=(",", ":"), sort_keys=True)
        print(
            "{}\t{}\t{}\t{}\t{}".format(
                firewall.get("firewallId", ""),
                firewall.get("name") or "",
                firewall.get("status") or "",
                instances_json,
                rules_json,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
