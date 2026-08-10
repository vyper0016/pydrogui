'''
Environment metadata for benchmark runs.

Collects host, container-limit and toolchain information so that a set of
benchmark results can be attributed to a concrete machine and code revision.
Everything degrades to None when a source is not exposed by the runtime, so
this is safe to call outside a Linux container as well.
'''
import os
import platform
import sys
import time

def _read(path: str):
    '''Read a procfs/sysfs file, or None if the runtime does not expose it.'''
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return None


def _proc_field(path: str, prefix: str):
    '''Return the value of the first `prefix: value` line in a procfs file.'''
    content = _read(path)
    if not content:
        return None
    for line in content.splitlines():
        if line.startswith(prefix):
            return line.split(":", 1)[1].strip()
    return None


def _usable_cores():
    '''Cores this process may actually run on. os.cpu_count() reports the host.'''
    get_affinity = getattr(os, "sched_getaffinity", None)
    if get_affinity is None:
        return None
    return len(get_affinity(0))


def _pypy_version():
    info = getattr(sys, "pypy_version_info", None)
    if info is None:
        return None
    return f"{info.major}.{info.minor}.{info.micro}"


def cpu_quota() -> dict:
    '''
    CPU allocation as enforced by the container runtime.

    cgroup v2 states it as `<quota> <period>` in cpu.max, cgroup v1 as two
    separate files. A quota of 50000 over a period of 100000 means 0.5 CPU.
    '''
    quota = {"cpu_max_v2": _read("/sys/fs/cgroup/cpu.max")}
    quota["cpu_quota_us_v1"] = _read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
    quota["cpu_period_us_v1"] = _read("/sys/fs/cgroup/cpu/cpu.cfs_period_us")

    cores = None
    if quota["cpu_max_v2"]:
        parts = quota["cpu_max_v2"].split()
        if len(parts) == 2 and parts[0] != "max":
            cores = int(parts[0]) / int(parts[1])
    elif quota["cpu_quota_us_v1"] and quota["cpu_period_us_v1"]:
        limit, period = int(quota["cpu_quota_us_v1"]), int(quota["cpu_period_us_v1"])
        if limit > 0 and period > 0:
            cores = limit / period
    quota["allocated_cores"] = cores
    return quota


def memory_limit() -> dict:
    return {
        "memory_max_v2": _read("/sys/fs/cgroup/memory.max"),
        "memory_limit_v1": _read("/sys/fs/cgroup/memory/memory.limit_in_bytes"),
        "host_mem_total": _proc_field("/proc/meminfo", "MemTotal"),
    }


def collect_env(**extra) -> dict:
    '''Full environment record. Extra keyword arguments are merged in as-is.'''
    env = {
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "host_cpu_model": _proc_field("/proc/cpuinfo", "model name"),
        "host_cpu_count": os.cpu_count(),
        "usable_cores": _usable_cores(),
        "kernel": platform.release(),
        "arch": platform.machine(),
        "python_implementation": platform.python_implementation(),
        "python_version": sys.version.replace("\n", " "),
        "pypy_version": _pypy_version(),
    }
    env.update(cpu_quota())
    env.update(memory_limit())
    env.update(extra)
    return env


if __name__ == "__main__":
    import json
    print(json.dumps(collect_env(), indent=2))
