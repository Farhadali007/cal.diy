#!/usr/bin/env python3
"""Validate dev-install files for task 1.7 (guard checks).

Run from the fork root:
    python3 validate-dev-install.py
Exit 0 = all checks pass. Kept at the fork root as the validation
evidence for 1.7; re-run on VPS A before first use alongside
`docker compose --env-file .env.dev -f docker-compose.dev.yml config`.
"""
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent
COMPOSE = HERE / "docker-compose.dev.yml"
ENV_EXAMPLE = HERE / ".env.dev.example"

failures = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def main():
    compose_text = COMPOSE.read_text()
    env_text = ENV_EXAMPLE.read_text()
    data = yaml.safe_load(compose_text)
    check("compose YAML parses", isinstance(data, dict))

    services = data.get("services", {})
    check("services present", set(services) >= {"database", "redis", "calcom", "calcom-api", "studio"},
          f"found: {sorted(services)}")

    # Guards 1-2: exact caps per service.
    expected = {
        "database": ("1g", "0.50"),
        "redis": ("256m", "0.25"),
        "calcom": ("2g", "1.50"),
        "calcom-api": ("1g", "0.50"),
        "studio": ("512m", "0.25"),
    }
    for svc, (mem, cpu) in expected.items():
        limits = services.get(svc, {}).get("deploy", {}).get("resources", {}).get("limits", {})
        check(f"caps {svc}", limits.get("memory") == mem and limits.get("cpus") == cpu,
              f"got memory={limits.get('memory')} cpus={limits.get('cpus')}")

    # Guard 5: every published port loopback-bound; never 0.0.0.0; no bare host ports.
    published = []
    for svc, cfg in services.items():
        for port in cfg.get("ports", []):
            published.append((svc, str(port)))
    check("all published ports are 127.0.0.1-bound",
          all(p.startswith("127.0.0.1:") for _, p in published) and published,
          f"{published}")
    check("no 0.0.0.0 in any published port",
          all("0.0.0.0" not in p for _, p in published))
    check("database publishes no host port", not services["database"].get("ports"))

    # Guard 5 port numbers match the verified-free list.
    ports = sorted(p.split(":")[1] for _, p in published)
    check("remapped ports are 3300/3301/6381/5555", ports == ["3300", "3301", "5555", "6381"],
          f"got {ports}")

    # Guard 6: project name, network, prefixed names.
    check("project name voicero-caldev", data.get("name") == "voicero-caldev")
    check("own network", list(data.get("networks", {})) == ["voicero-caldev"])
    check("container names project-prefixed",
          all(cfg.get("container_name", "").startswith("voicero-caldev-")
              for cfg in services.values()))
    check("no upstream network 'stack' joined", "stack" not in compose_text)

    # Guard 7: pinned tags; no untagged postgres / redis:latest.
    images = {svc: cfg.get("image", "") for svc, cfg in services.items()}
    check("postgres pinned 16-alpine", images["database"] == "postgres:16-alpine")
    check("redis pinned 7-alpine", images["redis"] == "redis:7-alpine")
    check("no untagged postgres / redis:latest",
          "image: postgres\n" not in compose_text and "redis:latest" not in compose_text)

    # Guard 3: reduced heap build arg (session 6, option B: 3072, down
    # from 4096 after the session-5 cgroup OOM at the 6.5g builder cap).
    calcom_args = services["calcom"].get("build", {}).get("args", {})
    check("MAX_OLD_SPACE_SIZE=3072 build arg", str(calcom_args.get("MAX_OLD_SPACE_SIZE")) == "3072")

    # Guard 8: logging caps everywhere.
    check("logging capped on every service",
          all(cfg.get("logging", {}).get("options", {}).get("max-size") == "10m"
              and cfg.get("logging", {}).get("options", {}).get("max-file") == "3"
              for cfg in services.values()))

    # No seed; signup disabled in compose and env.
    check("no seed service/env",
          "seed" not in {s.lower() for s in services}
          and not any("SEED" in str(cfg.get("environment", [])) for cfg in services.values()))
    check("signup disabled in compose",
          "NEXT_PUBLIC_DISABLE_SIGNUP: \"true\"" in compose_text
          and "- NEXT_PUBLIC_DISABLE_SIGNUP=true" in compose_text)
    check("signup disabled in env template", "NEXT_PUBLIC_DISABLE_SIGNUP=true" in env_text)

    # Studio profile-gated.
    check("studio profile-gated", services["studio"].get("profiles") == ["tools"])

    # No hardcoded example credentials; no real-looking secrets.
    check("no upstream example creds", "magical_password" not in compose_text
          and "unicorn_user" not in compose_text)
    check("no Stripe keys / license key passed",
          "STRIPE_" not in compose_text and "CALCOM_LICENSE_KEY" not in compose_text)
    check("env template has only placeholders for secrets",
          all(tok in env_text for tok in ("CHANGE-ME-USE-A-STRONG-RANDOM-PASSWORD",
                                          "CHANGE-ME-GENERATE-ON-VPS-A"))
          and "postgresql://caldev_user:CHANGE-ME" in env_text)

    # Env template: loopback URLs only; DATABASE_URL uses in-network DNS.
    urls = re.findall(r"https?://[^\s\"']+", env_text)
    check("env URLs loopback-only (or in-network service DNS)",
          all(u.startswith("http://127.0.0.1:") for u in urls),
          f"{urls}")
    check("DATABASE_URL uses database:5432, never localhost/prod",
          "@database:5432/calendso" in env_text and "localhost:5432" not in env_text
          and "localhost:5450" not in env_text)

    # Compose interpolation reads the project env file, NOT env_file:
    # every documented compose invocation must pass --env-file .env.dev
    # (found at 1.8: plain `docker compose config` failed on ${POSTGRES_USER:?}).
    doc_text = (HERE / "DOCKER-DEV-INSTALL.md").read_text()
    check("procedure passes --env-file .env.dev to compose",
          doc_text.count("docker compose --env-file .env.dev") >= 3,
          f"found {doc_text.count('docker compose --env-file .env.dev')} invocations")
    check("compose studio comment passes --env-file .env.dev",
          "--env-file .env.dev" in compose_text)

    print("---")
    if failures:
        print(f"RESULT: FAIL ({len(failures)} failed)")
        return 1
    print("RESULT: PASS — all guard checks green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
