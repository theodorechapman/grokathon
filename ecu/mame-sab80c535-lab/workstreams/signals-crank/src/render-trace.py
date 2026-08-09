"""Render the strict two-column trace consumed by the MAME driver patch."""


def render_trace(transitions: tuple[object, ...], profile_name: str) -> str:
    lines = [
        "# Motronic crank pin transitions",
        f"# profile={profile_name}",
        "# cycle,level",
    ]
    lines.extend(f"{item.cycle},{item.level}" for item in transitions)
    return "\n".join(lines) + "\n"
