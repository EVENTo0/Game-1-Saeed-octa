import fs from 'node:fs';

const p='.evento/commercial-package.v1.json';
const d='docs/commercial/SAEED_COMMERCIAL_PACKAGE_V1.md';
const h='docs/customer/SAEED_CUSTOMER_HANDOFF_V1.md';
for(const x of [p,d,h,'LICENSES.md']) if(!fs.existsSync(x)) throw new Error('missing:'+x);

const pkg=JSON.parse(fs.readFileSync(p,'utf8'));
const doc=fs.readFileSync(d,'utf8');
const handoff=fs.readFileSync(h,'utf8');

if(pkg.sku!=='SAEED-ROYALE-WEB-V1') throw new Error('sku');
if(pkg.price?.mode!=='CUSTOM_QUOTE'||pkg.price?.currency!=='AED') throw new Error('price');
if(pkg.price?.recurring_evento_operations_fee!==false) throw new Error('daily_ops_fee');
if(pkg.delivery_model!=='Build → Customize → Deploy → Handoff → Customer Owns & Operates') throw new Error('delivery');
if(pkg.ownership?.customer_can_operate_independently!==true) throw new Error('independence');
if(!pkg.excluded?.includes('customer daily campaign/game operations by EVENTO')) throw new Error('ops_boundary');
if(!pkg.sale_gate?.current_ci_required||!pkg.sale_gate?.browser_mobile_smoke_required||!pkg.sale_gate?.license_boundary_required) throw new Error('sale_gate');

for(const phrase of ['CUSTOM_QUOTE (AED)','Daily customer operations: **NO by default**','LICENSES.md']){
  if(!doc.includes(phrase)) throw new Error('commercial_doc:'+phrase);
}
for(const phrase of ['Current Sellable Verification workflow PASS','customer production URL loads over HTTPS','EVENTO does not run the customer']){
  if(!handoff.includes(phrase)) throw new Error('handoff_doc:'+phrase);
}

console.log(JSON.stringify({ok:true,sku:pkg.sku,priceMode:pkg.price.mode,dailyOperationsByEvento:false},null,2));
