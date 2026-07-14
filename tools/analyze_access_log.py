# -*- coding: utf-8 -*-
"""
Nginx 访问日志分析脚本 —— 快速看清谁在扫你、谁在爆破登录。

无第三方依赖，纯标准库。适配 nginx 默认 combined 日志格式：
  $remote_addr - $user [$time_local] "$request" $status $bytes "$referer" "$ua"

用法：
  python tools/analyze_access_log.py /var/log/nginx/record_bolg.access.log
  python tools/analyze_access_log.py /var/log/nginx/record_bolg.access.log*   # 含滚动 .gz
  python tools/analyze_access_log.py access.log --top 20 --gen-deny

经 ProxyFix + nginx 部署时，日志里的 $remote_addr 已是真实客户端 IP。
脚本只做只读分析与建议，绝不修改防火墙或执行任何封禁。
"""
import argparse
import glob
import gzip
import re
import sys
from collections import defaultdict

# combined 日志行解析
LOG_RE = re.compile(
    r'(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] '
    r'"(?P<method>\S+) (?P<path>\S+)[^"]*" '
    r'(?P<status>\d{3}) (?P<bytes>\S+) '
    r'"(?P<referer>[^"]*)" "(?P<ua>[^"]*)"'
)

# 常见漏洞/后台/配置探测特征——命中即视为扫描行为
SCAN_PATTERNS = re.compile(
    r'(?:'
    r'\.env|\.git|\.svn|\.ssh|\.aws|\.DS_Store|'
    r'wp-login|wp-admin|wp-content|xmlrpc\.php|'
    r'phpmyadmin|pma|myadmin|adminer|'
    r'\.php|\.asp|\.aspx|\.jsp|\.cgi|'
    r'/config|/backup|\.bak|\.sql|\.zip|\.tar|\.gz$|'
    r'/actuator|/console|/solr|/druid|'
    r'/etc/passwd|\.\./|%2e%2e|'
    r'/vendor/|/\.well-known/.*\.php|'
    r'eval\(|base64_|/shell|/cmd'
    r')',
    re.IGNORECASE,
)

# 你项目里真实存在的登录相关端点
LOGIN_PATHS = ('/login', '/login_confirm')

# 明显是机器人/工具的 UA 特征
BOT_UA = re.compile(
    r'(?:curl|wget|python-requests|python-urllib|go-http|libwww|'
    r'nikto|sqlmap|nmap|masscan|zgrab|censys|nuclei|acunetix|'
    r'httpx|scan|bot|spider|crawler)',
    re.IGNORECASE,
)


def open_any(path):
    """透明打开普通或 .gz 日志文件。"""
    if path.endswith('.gz'):
        return gzip.open(path, 'rt', encoding='utf-8', errors='replace')
    return open(path, 'r', encoding='utf-8', errors='replace')


def iter_lines(paths):
    for path in paths:
        try:
            with open_any(path) as f:
                for line in f:
                    yield line
        except OSError as e:
            print(f"[跳过] 无法读取 {path}: {e}", file=sys.stderr)


def analyze(paths):
    stat = {
        'total': 0,
        'parsed': 0,
        'ip_hits': defaultdict(int),
        'ip_404': defaultdict(int),
        'ip_scan': defaultdict(int),
        'ip_login': defaultdict(int),
        'ip_login_fail': defaultdict(int),
        'ip_ua': defaultdict(set),
        'ip_bot': defaultdict(bool),
        'scan_paths': defaultdict(int),
        'notfound_paths': defaultdict(int),
        'first_time': None,
        'last_time': None,
    }
    for line in iter_lines(paths):
        stat['total'] += 1
        m = LOG_RE.search(line)
        if not m:
            continue
        stat['parsed'] += 1
        ip     = m.group('ip')
        path   = m.group('path')
        status = m.group('status')
        ua     = m.group('ua')
        t      = m.group('time')

        if stat['first_time'] is None:
            stat['first_time'] = t
        stat['last_time'] = t

        stat['ip_hits'][ip] += 1
        stat['ip_ua'][ip].add(ua[:80])
        if BOT_UA.search(ua) or ua in ('', '-'):
            stat['ip_bot'][ip] = True

        if status == '404':
            stat['ip_404'][ip] += 1
            stat['notfound_paths'][path[:80]] += 1

        if SCAN_PATTERNS.search(path):
            stat['ip_scan'][ip] += 1
            stat['scan_paths'][path[:80]] += 1

        if any(path.startswith(p) for p in LOGIN_PATHS):
            stat['ip_login'][ip] += 1
            # 4xx 视为失败尝试（403 限流 / 401 / 400 等）
            if status.startswith('4'):
                stat['ip_login_fail'][ip] += 1
    return stat


def score_ip(stat, ip):
    """给单个 IP 打可疑分，返回 (分数, 理由列表)。"""
    score = 0
    reasons = []
    n404  = stat['ip_404'][ip]
    scan  = stat['ip_scan'][ip]
    login = stat['ip_login'][ip]
    hits  = stat['ip_hits'][ip]

    if scan:
        score += min(scan, 10) * 3
        reasons.append(f"扫描漏洞路径 {scan} 次")
    if n404 >= 10:
        score += min(n404 // 10, 5) * 2
        reasons.append(f"404 达 {n404} 次")
    if login >= 10:
        score += min(login // 10, 5) * 3
        reasons.append(f"访问登录接口 {login} 次")
    if stat['ip_bot'][ip]:
        score += 3
        reasons.append("UA 为工具/机器人或缺失")
    # 404 占比过高 = 无差别探测
    if hits >= 20 and n404 / hits > 0.6:
        score += 4
        reasons.append(f"404 占比 {n404/hits:.0%}")
    return score, reasons


def top(counter, n):
    return sorted(counter.items(), key=lambda kv: kv[1], reverse=True)[:n]


def main():
    ap = argparse.ArgumentParser(description="Nginx 访问日志攻击画像分析")
    ap.add_argument('logs', nargs='+', help="日志文件路径，支持通配符与 .gz")
    ap.add_argument('--top', type=int, default=15, help="各榜单显示条数（默认15）")
    ap.add_argument('--gen-deny', action='store_true',
                    help="为高可疑 IP 生成 nginx deny / iptables 封禁片段")
    args = ap.parse_args()

    # Windows 控制台默认 GBK，会因中文/符号抛 UnicodeEncodeError；统一切到 UTF-8
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    # 展开通配符
    paths = []
    for pat in args.logs:
        matched = glob.glob(pat)
        paths.extend(matched if matched else [pat])

    stat = analyze(paths)
    if stat['parsed'] == 0:
        print("没有解析到任何日志行。请确认日志路径与格式（需 nginx combined 格式）。")
        return

    print("=" * 60)
    print("概览")
    print("=" * 60)
    print(f"日志行数        : {stat['total']}")
    print(f"成功解析        : {stat['parsed']}")
    print(f"独立 IP         : {len(stat['ip_hits'])}")
    print(f"时间跨度        : {stat['first_time']}  →  {stat['last_time']}")

    print("\n" + "=" * 60)
    print(f"Top {args.top} 请求量 IP")
    print("=" * 60)
    for ip, c in top(stat['ip_hits'], args.top):
        flag = " [bot]" if stat['ip_bot'][ip] else ""
        print(f"  {c:>7}  {ip}{flag}")

    print("\n" + "=" * 60)
    print(f"Top {args.top} 被扫描的漏洞/敏感路径（你根本没有的路径）")
    print("=" * 60)
    if stat['scan_paths']:
        for p, c in top(stat['scan_paths'], args.top):
            print(f"  {c:>7}  {p}")
    else:
        print("  （未命中已知扫描特征，噪音较轻）")

    print("\n" + "=" * 60)
    print(f"Top {args.top} 404 路径")
    print("=" * 60)
    for p, c in top(stat['notfound_paths'], args.top):
        print(f"  {c:>7}  {p}")

    print("\n" + "=" * 60)
    print("登录接口访问画像（疑似爆破）")
    print("=" * 60)
    login_rank = top(stat['ip_login'], args.top)
    if login_rank and login_rank[0][1] > 0:
        print(f"  {'总次数':>6} {'失败4xx':>7}  IP")
        for ip, c in login_rank:
            if c == 0:
                continue
            print(f"  {c:>6} {stat['ip_login_fail'][ip]:>7}  {ip}")
    else:
        print("  登录接口暂无异常高频访问")

    # 可疑 IP 汇总评分
    scored = []
    for ip in stat['ip_hits']:
        s, reasons = score_ip(stat, ip)
        if s > 0:
            scored.append((s, ip, reasons))
    scored.sort(reverse=True)

    print("\n" + "=" * 60)
    print(f"可疑 IP 排行（分数越高越可疑）Top {args.top}")
    print("=" * 60)
    for s, ip, reasons in scored[:args.top]:
        print(f"  [{s:>3}] {ip:<40} {'; '.join(reasons)}")

    if args.gen_deny:
        # 取分数 >= 10 的 IP 作为封禁候选
        block = [ip for s, ip, _ in scored if s >= 10]
        print("\n" + "=" * 60)
        print(f"封禁建议（分数≥10 的 {len(block)} 个 IP，请人工复核后使用）")
        print("=" * 60)
        print("\n# --- nginx：放入 server 块 ---")
        for ip in block:
            print(f"deny {ip};")
        print("\n# --- iptables ---")
        for ip in block:
            print(f"iptables -A INPUT -s {ip} -j DROP")
        print("\n注意：封禁前请确认这些不是你自己的出口 IP 或 CDN 回源 IP。")


if __name__ == '__main__':
    main()
