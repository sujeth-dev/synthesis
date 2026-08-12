"""Download the ASSISTments 2009-2010 skill-builder dataset.

Usage:
    python download_data.py

Fetches skill_builder_data.csv into data/ and verifies its MD5 checksum
against the value published by the mirror below. The raw CSV is never
committed to git (see .gitignore) -- this script is the reproducible
substitute.
"""
import hashlib
import os
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEST_PATH = os.path.join(DATA_DIR, "skill_builder_data.csv")

# Figshare mirror of the official ASSISTments 2009-2010 "skill builder" data
# (source page: https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data/skill-builder-data-2009-2010).
# Figshare item: https://figshare.com/articles/dataset/skill_builder_data_csv/25309000
# License: CC BY 4.0. See README.md for citation terms.
DOWNLOAD_URL = "https://ndownloader.figshare.com/files/44732737"
EXPECTED_MD5 = "9410c31fadc7ad6518d296ce254ec4ab"


def md5sum(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)

    if os.path.exists(DEST_PATH) and md5sum(DEST_PATH) == EXPECTED_MD5:
        print(f"Already downloaded and verified: {DEST_PATH}")
        return

    print(f"Downloading {DOWNLOAD_URL} -> {DEST_PATH}")
    urllib.request.urlretrieve(DOWNLOAD_URL, DEST_PATH)

    actual_md5 = md5sum(DEST_PATH)
    if actual_md5 != EXPECTED_MD5:
        os.remove(DEST_PATH)
        raise RuntimeError(
            f"MD5 mismatch: expected {EXPECTED_MD5}, got {actual_md5}. "
            "The mirror may have changed; update EXPECTED_MD5 after manually "
            "verifying the new file against the official ASSISTments page."
        )

    print(f"Downloaded and verified ({actual_md5}).")


if __name__ == "__main__":
    main()
