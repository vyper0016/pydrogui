'''
Optional local output paths for generated thesis artefacts.

paths.json names absolute destinations in a LaTeX checkout that lives outside
this repository, so it is machine-specific and gitignored;
paths.example.json is the committed template.

Every lookup degrades to "no copy" when the file, the key or the destination
directory is missing. The benchmark itself runs inside the container, where a
host path cannot resolve -- publishing is skipped there and reported, never
fatal.
'''
import json
import os
import shutil

PATHS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "paths.json")


def load() -> dict:
    '''Contents of paths.json, or {} when it is absent or unreadable.'''
    try:
        with open(PATHS_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def target(key: str) -> str | None:
    '''
    Destination file for `key`, or None if it cannot be written.

    None is the normal case in the container: the configured path points at a
    host directory that does not exist there.
    '''
    dest = load().get(key)
    if not dest:
        return None
    if not os.path.isdir(os.path.dirname(dest)):
        return None
    return dest


def publish(local_path: str, key: str) -> str | None:
    '''Copy a generated file to its configured destination. Returns the path.'''
    dest = target(key)
    if dest is None:
        print(f"paths: no reachable destination for {key!r}, kept {local_path}")
        return None
    shutil.copyfile(local_path, dest)
    print(f"paths: copied {local_path} -> {dest}")
    return dest
