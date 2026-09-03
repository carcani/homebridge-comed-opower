import argparse
import asyncio
import getpass
import json
import os
import sys
from datetime import datetime, timedelta

import aiohttp

from opower import (
    AggregateType,
    Opower,
    create_cookie_jar,
)
from opower.exceptions import MfaChallenge, InvalidAuth


UTILITY = "comed"
DEFAULT_LOGIN_FILE = "comed-login.json"


async def fetch_data(
    username,
    password,
    login_file,
    days,
):
    login_data = None

    if login_file and os.path.exists(login_file):
        try:
            with open(login_file, "r") as f:
                login_data = json.load(f)
        except (OSError, json.JSONDecodeError):
            login_data = None

    async with aiohttp.ClientSession(
        cookie_jar=create_cookie_jar()
    ) as session:

        opower = Opower(
            session,
            UTILITY,
            username,
            password,
            None,
            login_data,
        )

        try:
            await opower.async_login()

        except MfaChallenge as e:
            # Interactive MFA is only useful when running manually.
            if not sys.stdin.isatty():
                raise RuntimeError(
                    "ComEd login requires MFA. "
                    "Run the helper manually once to refresh "
                    "comed-login.json."
                )

            handler = e.handler

            print(
                "MFA Challenge: "
                + str(e),
                file=sys.stderr,
            )

            options = await handler.async_get_mfa_options()

            if options:
                print(
                    "Please select an MFA option:",
                    file=sys.stderr,
                )

                for i, (_, value) in enumerate(
                    options.items()
                ):
                    print(
                        f"  [{i + 1}] {value}",
                        file=sys.stderr,
                    )

                choice_index = int(
                    input(
                        "Enter the number of your choice: "
                    )
                ) - 1

                choice_key = list(
                    options.keys()
                )[choice_index]

                await handler.async_select_mfa_option(
                    choice_key
                )

                print(
                    f"A security code has been sent via "
                    f"{options[choice_key]}.",
                    file=sys.stderr,
                )

            code = getpass.getpass(
                "Enter the security code: "
            )

            try:
                login_data = (
                    await handler.async_submit_mfa_code(
                        code
                    )
                )
            except InvalidAuth:
                raise RuntimeError(
                    "ComEd MFA validation failed."
                )

            if login_file:
                with open(login_file, "w") as f:
                    json.dump(
                        login_data,
                        f,
                        indent=2,
                    )

            opower.login_data = login_data

            await opower.async_login()

        except InvalidAuth:
            raise RuntimeError(
                "ComEd username/password authentication failed."
            )

        accounts = await opower.async_get_accounts()

        if not accounts:
            raise RuntimeError(
                "No ComEd accounts found."
            )

        account = accounts[0]

        end = datetime.now()
        start = end - timedelta(days=days)

        readings = await opower.async_get_usage_reads(
            account,
            AggregateType.HALF_HOUR,
            start,
            end,
        )

        result = []

        for reading in readings:
            result.append({
                "start": str(reading.start_time),
                "end": str(reading.end_time),
                "kwh": reading.consumption,
            })

        return result


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--username",
        default=os.environ.get(
            "OPOWER_USERNAME"
        ),
    )

    parser.add_argument(
        "--password",
        default=os.environ.get(
            "OPOWER_PASSWORD"
        ),
    )

    parser.add_argument(
        "--login-file",
        default=DEFAULT_LOGIN_FILE,
    )

    parser.add_argument(
        "--days",
        type=int,
        default=2,
    )

    args = parser.parse_args()

    if not args.username:
        print(
            json.dumps({
                "ok": False,
                "error": "Missing OPOWER_USERNAME",
            })
        )
        sys.exit(1)

    if not args.password:
        print(
            json.dumps({
                "ok": False,
                "error": "Missing OPOWER_PASSWORD",
            })
        )
        sys.exit(1)

    try:
        readings = asyncio.run(
            fetch_data(
                args.username,
                args.password,
                args.login_file,
                args.days,
            )
        )

        print(
            json.dumps({
                "ok": True,
                "utility": UTILITY,
                "readings": readings,
            })
        )

    except Exception as e:
        print(
            json.dumps({
                "ok": False,
                "error": str(e),
            })
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
