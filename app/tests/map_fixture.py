"""Small synthetic vector tile for offline interaction checks, not real roads."""
import json

def varint(n):
    data=bytearray()
    while n>127:data.append((n&127)|128);n>>=7
    data.append(n)
    return bytes(data)
def field(n,value):
    if isinstance(value,str):value=value.encode()
    return varint(n*8+2)+varint(len(value))+value if isinstance(value,bytes) else varint(n*8)+varint(value)
def packed(values):return b''.join(varint(v) for v in values)
def geometry(points,kind):
    commands=[];last=[0,0]
    for i,(x,y) in enumerate(points):
        if i==0:commands.append(9)
        elif i==1:commands.append(((len(points)-1)<<3)|2)
        for j,v in enumerate((x,y)):
            delta=v-last[j];commands.append((delta<<1)^(delta>>31));last[j]=v
    if kind==3:commands.append(15)
    return packed(commands)
def layer(name,kind,points,props=None):
    props=props or {};keys=list(props);values=list(props.values())
    feat=field(1,1)+field(2,packed([v for i in range(len(keys)) for v in (i,i)]))+field(3,kind)+field(4,geometry(points,kind))
    raw=field(15,2)+field(1,name)+field(2,feat)
    for key in keys:raw+=field(3,key)
    for value in values:raw+=field(4,field(1,value))
    return field(3,raw+field(5,4096))
TILE=b''.join([
    layer('park',3,[(200,200),(1600,200),(1600,1400),(200,1400)]),
    layer('water',3,[(0,3000),(4096,3000),(4096,3600),(0,3600)]),
    layer('building',3,[(2100,200),(3000,200),(3000,1000),(2100,1000)]),
    layer('transportation',2,[(0,2000),(4096,2400)],{'class':'minor'}),
    layer('landcover',3,[(2000,900),(3900,900),(3900,1700),(2000,1700)],{'class':'wood'}),
])
def install_vector_map(target,on_tile=None):
    def serve(route):
        url=route.request.url
        headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}
        if '/fonts/' in url:
            route.fulfill(body=b'',content_type='application/x-protobuf',headers=headers)
        elif '/planet/' in url:
            route.fulfill(json={'tilejson':'3.0.0','tiles':['https://tiles.openfreemap.org/fixture/{z}/{x}/{y}.pbf'],'minzoom':0,'maxzoom':22},headers=headers)
        else:
            if on_tile:on_tile(url)
            route.fulfill(body=TILE,content_type='application/x-protobuf',headers=headers)
    target.route('**/*.openfreemap.org/**',serve)
