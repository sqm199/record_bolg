import json
import os
import threading

_lock = threading.Lock()
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')


def _path(name):
    return os.path.join(DATA_DIR, f'{name}.json')


def load(name):
    with _lock:
        try:
            with open(_path(name), 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return []


def save(name, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with _lock:
        with open(_path(name), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)