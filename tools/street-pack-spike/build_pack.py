"""Isolated data spike. Not imported by, or deployed with, the USPUT app."""
import argparse
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import osmium

BOUNDS = (18.20, 43.75, 18.55, 43.95)
CYRILLIC = dict(zip(
    'абвгдђежзијклљмнњопрстћуфхцчџш',
    ['a','b','v','g','d','đ','e','ž','z','i','j','k','l','lj','m','n','nj','o','p','r','s','t','ć','u','f','h','c','č','dž','š'],
))


def latin(value):
    def word(match):
        source = match.group()
        capitals = source.isupper()
        result = []
        for char in source:
            replacement = CYRILLIC.get(char.lower(), char)
            if char.isupper():
                replacement = replacement.upper() if capitals else replacement.capitalize()
            result.append(replacement)
        return ''.join(result)
    return re.sub(r'[^\W\d_]+', word, value, flags=re.UNICODE)


def fold(value):
    text = latin(value).casefold().replace('đ', 'dj')
    return ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c))


def clip(a, b):
    west, south, east, north = BOUNDS
    dx, dy = b[0] - a[0], b[1] - a[1]
    low, high = 0.0, 1.0
    for p, q in zip((-dx, dx, -dy, dy), (a[0]-west, east-a[0], a[1]-south, north-a[1])):
        if p == 0:
            if q < 0:
                return None
        else:
            ratio = q / p
            if p < 0:
                low = max(low, ratio)
            else:
                high = min(high, ratio)
            if low > high:
                return None
    ends = [[round(a[0] + t*dx, 5), round(a[1] + t*dy, 5)] for t in (low, high)]
    return ends if ends[0] != ends[1] else None


class Streets(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.records = []
        self.scanned = 0

    def way(self, way):
        self.scanned += 1
        tags = dict(way.tags)
        if tags.get('highway', '') in ('', 'construction', 'proposed') or tags.get('access') in ('private', 'no'):
            return
        name = tags.get('name:bs') or tags.get('name')
        if not name or len(way.nodes) < 2:
            return
        if any(not node.location.valid() for node in way.nodes):
            raise ValueError(f'Incomplete geometry in way {way.id}')
        points = [(node.lon, node.lat) for node in way.nodes]
        segments = []
        for a, b in zip(points, points[1:]):
            clipped = clip(a, b)
            if not clipped:
                continue
            if segments and segments[-1][-1] == clipped[0]:
                segments[-1].append(clipped[1])
            else:
                segments.append(clipped)
        if not segments:
            return
        name = latin(name.strip())
        aliases = set()
        for tag in ('name','name:bs','name:hr','name:sr','name:sr-Latn','name:en','alt_name','loc_name','short_name'):
            for alias in tags.get(tag, '').split(';'):
                alias = latin(alias.strip())
                if alias and fold(alias) != fold(name):
                    aliases.add(alias)
        self.records.append({'id': f'osm:way/{way.id}', 'name': name, 'aliases': sorted(aliases), 'segments': segments})


def build(source, output, source_url, fixture=False):
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            digest.update(block)
    handler = Streets()
    handler.apply_file(str(source), locations=True)
    if not handler.records:
        raise ValueError('No named street geometries found in trial bounds; refusing an empty city pack')
    pack = {
        'schemaVersion': 1,
        'purpose': 'synthetic-fixture-only' if fixture else 'data-spike-not-production',
        'city': 'Sarajevsko testno područje',
        'countryCode': 'BA',
        'bounds': list(BOUNDS),
        'source': {
            'url': source_url,
            'sha256': digest.hexdigest(),
            'processedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'license': 'SYNTHETIC TEST DATA' if fixture else 'ODbL-1.0',
            'attribution': 'Synthetic test data; not actual Sarajevo coverage' if fixture else '© OpenStreetMap contributors',
            'copyrightUrl': None if fixture else 'https://www.openstreetmap.org/copyright',
        },
        'streets': sorted(handler.records, key=lambda record: record['id']),
    }
    raw = json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    compressed = gzip.compress(raw, mtime=0)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    output.with_suffix(output.suffix+'.gz').write_bytes(compressed)
    stats = {
        'purpose': pack['purpose'], 'inputBytes': source.stat().st_size,
        'waysScanned': handler.scanned, 'streetRecords': len(handler.records),
        'uniqueNames': len({fold(record['name']) for record in handler.records}),
        'geometryPoints': sum(len(segment) for record in handler.records for segment in record['segments']),
        'jsonBytes': len(raw), 'gzipBytes': len(compressed), 'sourceSha256': digest.hexdigest(),
    }
    output.with_suffix('.report.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
    return pack, stats


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--source-url', required=True)
    parser.add_argument('--fixture', action='store_true')
    args = parser.parse_args()
    _, stats = build(args.source, args.output, args.source_url, args.fixture)
    print(json.dumps(stats, indent=2))
