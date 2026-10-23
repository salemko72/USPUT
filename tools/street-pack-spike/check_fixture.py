"""Synthetic checks only: never use these byte counts as Sarajevo estimates."""
from pathlib import Path
import tempfile
import osmium
from build_pack import build, latin

osm = '''<osm version="0.6" generator="USPUT synthetic fixture">
<node id="1" lat="43.85" lon="18.4"><tag k="addr:housenumber" v="PRIVATE-HOUSE-123"/></node>
<node id="2" lat="43.851" lon="18.401"/><node id="3" lat="43.852" lon="18.402"/>
<node id="4" lat="43.86" lon="18.42"/><node id="5" lat="43.861" lon="18.421"/>
<node id="6" lat="45.8" lon="16.0"/><node id="7" lat="45.801" lon="16.001"/>
<node id="8" lat="43.85" lon="18.19"/><node id="9" lat="43.85" lon="18.56"/>
<way id="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/><tag k="name" v="Алеја липа"/><tag k="addr:housenumber" v="PRIVATE-HOUSE-456"/></way>
<way id="2"><nd ref="4"/><nd ref="5"/><tag k="highway" v="residential"/><tag k="name" v="Aleja lipa"/></way>
<way id="3"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/><tag k="name" v="Ulica 16. brigade"/><tag k="alt_name" v="Шеснаеста бригада;16. brigada"/></way>
<way id="4"><nd ref="6"/><nd ref="7"/><tag k="highway" v="residential"/><tag k="name" v="OUTSIDE"/></way>
<way id="5"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way>
<way id="6"><nd ref="1"/><nd ref="2"/><tag k="building" v="yes"/><tag k="name" v="HOUSE"/></way>
<way id="7"><nd ref="8"/><nd ref="9"/><tag k="highway" v="primary"/><tag k="name" v="Crossing"/></way>
<way id="8"><nd ref="1"/><nd ref="2"/><tag k="highway" v="service"/><tag k="name" v="PRIVATE"/><tag k="access" v="private"/></way>
</osm>'''
with tempfile.TemporaryDirectory(prefix='usput-street-fixture-') as directory:
    root = Path(directory)
    source = root/'fixture.osm'
    source.write_text(osm, encoding='utf-8')
    pack, report = build(source, root/'fixture.json', 'synthetic fixture, not downloaded', fixture=True)
    assert report['streetRecords'] == 4
    assert report['uniqueNames'] == 3
    assert pack['purpose'] == 'synthetic-fixture-only'
    assert pack['streets'][0]['name'] == 'Aleja lipa'
    assert len([r for r in pack['streets'] if r['name'] == 'Aleja lipa']) == 2
    assert any(r['name'] == 'Ulica 16. brigade' for r in pack['streets'])
    numbered = next(r for r in pack['streets'] if r['name'] == 'Ulica 16. brigade')
    assert set(numbered['aliases']) == {'Šesnaesta brigada', '16. brigada'}
    assert b'PRIVATE-HOUSE' not in (root/'fixture.json').read_bytes()
    assert not any(r['name'] in ('HOUSE','OUTSIDE','PRIVATE') for r in pack['streets'])
    crossing = next(r for r in pack['streets'] if r['name'] == 'Crossing')
    assert crossing['segments'] == [[[18.2, 43.85], [18.55, 43.85]]]
    assert latin('ЉУБЉАНА / Љубљана') == 'LJUBLJANA / Ljubljana'
    for record in pack['streets']:
        for segment in record['segments']:
            assert all(18.2 <= x <= 18.55 and 43.75 <= y <= 43.95 for x,y in segment)
    binary = root/'fixture.osm.pbf'
    writer = osmium.SimpleWriter(str(binary))
    class Copy(osmium.SimpleHandler):
        def node(self, node):
            writer.add_node(node)
        def way(self, way):
            writer.add_way(way)
    try:
        Copy().apply_file(str(source))
    finally:
        writer.close()
    binary_pack, _ = build(binary, root/'binary.json', 'synthetic PBF fixture', fixture=True)
    assert binary_pack['streets'] == pack['streets']
print('PASS: XML/PBF parity; named streets only; no house data; street-name digits retained; Latin labels and aliases; disconnected ways preserved; boundary crossings clipped; private/unnamed/outside features excluded. Synthetic fixture, not a city measurement.')
