import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {request} from '../../scripts/import-paid-promotions.mjs';
const dir='imports/creator-pricing/';
const sourceFile='Paid_Partnership_Full_587_Rows.xlsx';
const input=JSON.parse(fs.readFileSync(dir+'source-rows.json','utf8'));
const root=process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key||!process.env.NEXT_PUBLIC_SUPABASE_URL)throw Error('Missing database configuration');
const headers={apikey:key,Authorization:'Bearer '+key};
async function read(table,select,order){const out=[];for(let offset=0;;offset+=1000){const r=await request(`${root}${table}?select=${select}&order=${order}&offset=${offset}&limit=1000`,{headers});if(!r.ok)throw Error(`${table} read failed ${r.status}: ${await r.text()}`);const rows=await r.json();out.push(...rows);if(rows.length<1000)break;}return out;}
const [existing,profiles,authors,posts]=await Promise.all([read('creator_pricing','*','username.asc'),read('author_profiles','username','username.asc'),read('paid_authors','author_username','id.asc'),read('paid_promotion_posts','author_username,tweet_id','tweet_id.asc')]);
const knownProfiles=new Set(profiles.map(x=>x.username.toLowerCase()));
const knownCreators=new Set([...knownProfiles,...authors.map(x=>x.author_username.toLowerCase()),...posts.map(x=>x.author_username.toLowerCase())]);
const stored=new Map(existing.map(x=>[x.username.toLowerCase(),x]));
const groups=new Map(),skipped=[],issues=[],conflicts=[];
function parse(v){if(v==null||v==='')return null;if(typeof v==='number')return v>=0&&Number.isFinite(v)?{min:v,max:v,currency:null}:null;let s=String(v).trim().toUpperCase().replaceAll(',','');if(s==='FREE')return {min:0,max:0,currency:null};const currency=/EUR|€/.test(s)?'EUR':/USD|\$/.test(s)?'USD':null;s=s.replace(/EUR|USD|€|\$/g,'').trim();const m=s.match(/^(\d+(?:\.\d+)?)(K)?(?:\s*-\s*(\d+(?:\.\d+)?)(K)?)?$/);if(!m)return null;const min=Number(m[1])*(m[2]?1000:1),max=m[3]?Number(m[3])*(m[4]?1000:1):min;return min<=max?{min,max,currency}:null;}
for(const r of input){const url=String(r.values['X Profile']??'').trim();const m=url.match(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})\/?(?:[?#].*)?$/i);if(!m){skipped.push({...r,reason:'Invalid X profile URL'});continue;}const username=m[1].toLowerCase();if(!groups.has(username))groups.set(username,[]);groups.get(username).push(r);}
const rows=[];
for(const [username,rs]of groups){const old=stored.get(username)||{},last=rs.at(-1),notes=[];
 const row={username,creator_name:last.values.Creator,x_profile_url:`https://x.com/${username}`,source_file:sourceFile,updated_at:new Date().toISOString()};
 const rawRows=new Map((Array.isArray(old.source_rows)?old.source_rows:[]).map((r,i)=>[`${r.file||'previous'}:${r.sheet}:${r.row??i}`,r]));
 for(const r of rs)rawRows.set(`${sourceFile}:${r.sheet}:${r.row}`,{file:sourceFile,...r});row.source_rows=[...rawRows.values()];
 const currencies=new Set();
 for(const [column,field]of [['Retweet Rate','retweet_rate'],['Comment Rate','comment_rate'],['Co-tweet / Quote Rate','quote_rate'],['total','total_rate'],['Bundle (All 3)','bundle']]){
  const candidates=[];
  for(const r of rs){const v=r.values[column];if(v==null||v==='')continue;
   // A formula total of zero beside entirely blank price cells means no supplied quote.
   if(column==='total'&&v===0&&['Retweet Rate','Comment Rate','Co-tweet / Quote Rate','Bundle (All 3)'].every(c=>r.values[c]==null||r.values[c]===''))continue;
   const p=parse(v);if(!p){notes.push(`Row ${r.row}, ${column}: ${v}`);issues.push({username,row:r.row,column,value:v});continue;}candidates.push(p);
  }
  const distinct=[...new Map(candidates.map(p=>[JSON.stringify(p),p])).values()];
  if(distinct.length>1){const conflict={username,column,values:distinct,source_rows:rs.map(r=>r.row),resolution:'Retained existing value; otherwise NULL'};conflicts.push(conflict);notes.push(`Conflicting ${column}: ${distinct.map(p=>p.min===p.max?String(p.min):`${p.min}-${p.max}`).join(' / ')}; preserved in source_rows`);}
  const p=distinct.length===1?distinct[0]:null;
  if(field==='bundle'){row.bundle_rate_min=p?.min??old.bundle_rate_min??null;row.bundle_rate_max=p?.max??old.bundle_rate_max??null;row.bundle_currency=p?.currency??old.bundle_currency??null;}
  else {row[field]=p?.min??old[field]??null;if(p?.currency)currencies.add(p.currency);}
 }
 row.currency=currencies.size===1?[...currencies][0]:old.currency??null;
 row.notes=[...new Set([...(old.notes?.split('\n')||[]),...notes])].filter(Boolean).join('\n')||null;
 rows.push(row);
}
const missingProfiles=rows.filter(r=>!knownProfiles.has(r.username));const missingAll=rows.filter(r=>!knownCreators.has(r.username));
const csv=(records,columns)=>columns.join(',')+'\n'+records.map(r=>columns.map(c=>'"'+String(r[c]??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
fs.writeFileSync(dir+'missing-author-profiles.csv',csv(missingProfiles,['username','creator_name','x_profile_url']));
fs.writeFileSync(dir+'missing-from-database.csv',csv(missingAll,['username','creator_name','x_profile_url']));
fs.writeFileSync(dir+'missing-usernames.txt',missingAll.map(r=>'@'+r.username).join('\n')+'\n');
fs.writeFileSync(dir+'prepared-pricing.json',JSON.stringify(rows,null,2)+'\n');
const report={sourceFile,inputRows:input.length,validSourceRows:input.length-skipped.length,uniqueUsernames:rows.length,duplicatesConsolidated:input.length-skipped.length-rows.length,existingPricingToUpdate:rows.filter(r=>stored.has(r.username)).length,newPricingToInsert:rows.filter(r=>!stored.has(r.username)).length,matchedAuthorProfiles:rows.length-missingProfiles.length,missingAuthorProfiles:missingProfiles.length,missingFromAllCreatorTables:missingAll.length,skipped,conflicts,issues,missingUsernames:missingAll.map(r=>r.username),status:'prepared'};
fs.writeFileSync(dir+'import-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,skipped:skipped.length,conflicts:conflicts.length,issues:issues.length,missingUsernames:undefined},null,2));
// Validate every selected column against the created schema before making writes.
const schema=await request(root+'creator_pricing?select='+Object.keys(rows[0]).join(',')+'&limit=0',{headers});if(!schema.ok)throw Error('Pricing schema mismatch: '+await schema.text());
const write=process.argv.includes('--write');if(!write){console.log('Preview only; pass --write to import');process.exit(0);}
for(let i=0;i<rows.length;i+=100){const r=await request(root+'creator_pricing?on_conflict=username',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows.slice(i,i+100))});if(!r.ok)throw Error('Pricing upsert failed '+r.status+': '+await r.text());console.log(`Saved ${Math.min(i+100,rows.length)}/${rows.length}`);}
const after=await read('creator_pricing','*','username.asc');
const saved=new Map(after.map(r=>[r.username,r]));
if(new Set(after.map(r=>r.username.toLowerCase())).size!==after.length)throw Error('Duplicate usernames after import');
for(const row of rows){const actual=saved.get(row.username);if(!actual)throw Error('Missing saved username '+row.username);for(const field of ['retweet_rate','comment_rate','quote_rate','total_rate','bundle_rate_min','bundle_rate_max','currency','bundle_currency'])if(actual[field]!==row[field])throw Error('Verification mismatch '+row.username+' '+field);if(!isDeepStrictEqual(actual.source_rows,row.source_rows))throw Error('Source rows mismatch '+row.username);}
report.status='verified';report.verifiedRows=rows.length;report.totalPricingRowsAfterImport=after.length;fs.writeFileSync(dir+'import-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:true,rows:rows.length,missingAuthorProfiles:missingProfiles.length,missingFromAllCreatorTables:missingAll.length}));
