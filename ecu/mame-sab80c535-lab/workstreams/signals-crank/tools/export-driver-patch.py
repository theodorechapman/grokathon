#!/usr/bin/env python3
"""Export the review source as an add-file MAME patch."""

from pathlib import Path


def export_driver_patch(source: Path, output: Path) -> None:
    body = "".join(f"+{line}\n" for line in source.read_text().splitlines())
    patch = (
        "diff --git a/src/mame/mame.lst b/src/mame/mame.lst\n"
        "--- a/src/mame/mame.lst\n"
        "+++ b/src/mame/mame.lst\n"
        "@@ -44005,6 +44005,9 @@ motronic175\n"
        " @source:skeleton/sab80c515test.cpp\n"
        " sab515test\n"
        " \n"
        "+@source:skeleton/sab80c515-capture-test.cpp\n"
        "+sab515cap\n"
        "+\n"
        " @source:skeleton/ms9540.cpp\n"
        " ms9540\n"
        " \n"
        "diff --git a/src/mame/skeleton/sab80c515-capture-test.cpp "
        "b/src/mame/skeleton/sab80c515-capture-test.cpp\n"
        "new file mode 100644\n"
        "--- /dev/null\n"
        "+++ b/src/mame/skeleton/sab80c515-capture-test.cpp\n"
        f"@@ -0,0 +1,{len(source.read_text().splitlines())} @@\n"
        f"{body}"
    )
    output.write_text(patch, encoding="utf-8")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    export_driver_patch(
        root / "source" / "sab80c515-capture-test.cpp",
        root / "patches" / "sab80c515-capture-test-driver.patch",
    )


if __name__ == "__main__":
    main()
