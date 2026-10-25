// Isolated synthetic regional geocoder. Never calls real services.
await import('./street-fixture-server.mjs');
const {env}=await import('../server/local.mjs');
const original=env.ROUTING_FETCH;
env.PHOTON_URL='https://intercity-autocomplete.example.test/';
env.ROUTING_FETCH=async(input,options)=>{
 const u=new URL(input);if(u.hostname!=='intercity-autocomplete.example.test')return original(input,options);
 const q=u.searchParams.get('q')||'';
 const city=Number(u.searchParams.get('lat'))>44?'Zenica':'Sarajevo';
 const coords=city==='Zenica'?[17.908,44.212]:[18.4281,43.8607];
 return Response.json({features:[{geometry:{coordinates:coords},properties:{name:q,street:q,city,countrycode:'BA',osm_key:'highway',osm_value:'residential'}}]});
};
