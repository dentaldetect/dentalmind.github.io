/// <reference types="vite/client" />
import { en } from '../../src/i18n/en';
import { mountDentition } from '../../src/dentition/app';
import { isFdi, TEETH, type Fdi } from '../../src/dentition/teeth';
import { CONDITION_LABELS, kindForCode, type ConditionKind, type ConditionMap } from '../../src/dentition/conditions';
import { summarizeEvidence, type Finding } from './evidence';
import { resolveHosting } from './hosting';
import '../../src/dentition/dentition.css';
import './style.css';

type Mapping = { observation_id:string; bbox:number[]; fdi:string|null; atlas_node:string|null;
  geometry:string|null; identity_score:number; requires_review:boolean; review_reasons:string[]; findings_2d:string[] };
type Report = { schema_version:string; image_size:number[]; mappings:Mapping[]; patient_specific_3d:boolean;
  atlas:{model_sha256:string}; learned_identity_refinement_used?:boolean; findings?:Finding[];
  findings_analysis?:{available:boolean;unassigned_count?:number} };
const element = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const status = element('status');
const stage = element('image-stage');
const list = element('observations');
const analyze = element<HTMLButtonElement>('analyze');
const download = element<HTMLButtonElement>('download');
const modality=element<HTMLSelectElement>('modality');
const presenceButton=element<HTMLButtonElement>('presence');
const hosting=resolveHosting(location.href,import.meta.env.VITE_ATLAS_API_BASE??'');
const apiUrl=(path:string)=>{if(!hosting.apiBase)throw Error('Automatic analysis needs a connected backend. You can load a report or use manual simulations.');return new URL(path,hosting.apiBase).href;};
const atlasMetadata=fetch(hosting.catalog).then(response=>{if(!response.ok)throw Error('Atlas catalogue unavailable');return response.json();});
let image:HTMLImageElement|null=null;
let file:File|null=null;
let objectUrl:string|null=null;
let report:Report|null=null;
let presenceReport:any=null;
let selected:Fdi|null=null;
let manualConditions:ConditionMap={};
const showConditions=element<HTMLInputElement>('show-conditions');
const simulationTooth=element<HTMLSelectElement>('simulation-tooth');
const simulationKind=element<HTMLSelectElement>('simulation-kind');
for(const t of TEETH){const option=new Option(`${t.fdi} · ${t.name.en}`,t.fdi);simulationTooth.add(option);}
atlasMetadata.then(catalog=>{element<HTMLButtonElement>('example').hidden=!catalog.research_example_available;}).catch(()=>{});
if(!hosting.apiBase){
  element('example').textContent='Open illustrative example';
  status.textContent='Offline atlas: load a report or use manual simulations. Automatic detection needs a hosted backend.';
}
const viewer = mountDentition(element('atlas'), {lang:'en',strings:en.dentition,
  modelUrl:hosting.model,licenseUrl:hosting.license,onSelect(fdi) {selected=fdi;highlight();}});
viewer.ready.catch(() => {status.textContent='3D rendering unavailable. The tooth chart and correspondence list still work.';});

function highlight() {
  renderConditionInspector();
  stage.querySelectorAll('.finding-box').forEach(node=>node.remove());
  for(const f of report?.findings??[]){
    if(!selected||f.atlas_fdi!==selected)continue;
    const box=document.createElement('div');box.className='finding-box';
    box.style.left=`${f.box.x*100}%`;box.style.top=`${f.box.y*100}%`;box.style.width=`${f.box.w*100}%`;box.style.height=`${f.box.h*100}%`;
    box.textContent=`${f.code.replaceAll('_',' ')} · ${(f.score*100).toFixed(0)}%`;stage.append(box);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-fdi]')) {
    node.classList.toggle('selected',node.dataset.fdi===selected);
  }
  const matches=report?.mappings.filter(m=>m.fdi===selected)??[];
  const info=element('selection');info.replaceChildren();
  if (!selected) {info.textContent='Select a linked tooth to inspect its correspondence.';return;}
  const title=document.createElement('strong');title.textContent=`Tooth ${selected} · reference anatomy`;info.append(title);
  if(presenceReport){const hypothesis=presenceReport.hypotheses.find((h:any)=>h.fdi===selected);const p=document.createElement('p');p.textContent=hypothesis?`Image-level visibility score ${(hypothesis.visibility_score*100).toFixed(0)}%. Requires review. This does not locate the tooth in the X-ray or establish its shape.`:'No visibility hypothesis available.';info.append(p);return;}
  if (!matches.length) {const p=document.createElement('p');p.textContent='No 2D observation is linked to this atlas tooth. This does not establish that the tooth is present, absent or healthy.';info.append(p);return;}
  for (const m of matches) {
    const p=document.createElement('p');
    p.textContent=`${m.observation_id} · identity score ${(m.identity_score*100).toFixed(0)}% · ${m.requires_review?'review required':'reviewed linkage'}${m.geometry==='placeholder'?' · placeholder third-molar shape':''}`;
    info.append(p);
    const note=document.createElement('p');note.textContent=m.findings_2d.length?`2D findings: ${m.findings_2d.join('; ')}`:'No finding annotations were supplied for this observation.';info.append(note);
    if(m.review_reasons.length){const reason=document.createElement('small');reason.textContent=m.review_reasons.map(x=>x.replaceAll('_',' ')).join(' · ');info.append(reason);}
  }
}

function renderConditionInspector(){
  simulationTooth.value=selected??'';
  element<HTMLButtonElement>('apply-simulation').disabled=!selected;
  element<HTMLButtonElement>('clear-simulation').disabled=!selected||!manualConditions[selected]?.length;
  element<HTMLButtonElement>('clear-all-simulations').disabled=!Object.keys(manualConditions).length;
  const inspector=element('condition-inspector');inspector.replaceChildren();
  const add=(text:string,cls:string)=>{const p=document.createElement('p');p.className=cls;p.textContent=text;inspector.append(p);};
  if(!selected){add('Select a tooth in the X-ray, atlas or Tooth menu.','');return;}
  const found=(report?.findings??[]).filter(f=>f.atlas_fdi===selected);
  for(const f of found)add(`AI · Tooth ${selected}: ${f.code.replaceAll('_',' ')} · ${(f.score*100).toFixed(0)}% · ${f.decision==='positive'?'awaiting review':'uncertain; damage geometry not inferred'}`,'ai-finding');
  for(const c of manualConditions[selected]??[])add(`MANUAL SIMULATION · Tooth ${selected}: ${CONDITION_LABELS[c.kind]} · illustrative, not detected`,'manual-finding');
  if(!found.length&&!manualConditions[selected]?.length)add(`Tooth ${selected}: no linked condition evidence or manual example. Health and presence remain unassessed.`,'');
}

function updateConditionView(){
  const map:ConditionMap={};
  const statuses:Parameters<typeof viewer.setStatus>[0]={};
  for(const m of report?.mappings??[]){if(m.fdi&&isFdi(m.fdi))statuses[m.fdi]={level:'watch',summary:'Health unassessed · no linked disease finding',items:[...m.findings_2d,'2D correspondence — awaiting review']};}
  for(const h of presenceReport?.hypotheses??[]){if(isFdi(h.fdi))statuses[h.fdi]={level:'watch',summary:'Health unassessed · visibility only',items:['Image-level visibility hypothesis; localization unavailable']};}
  const evidence = summarizeEvidence(report?.findings??[]);
  for(const [fdi, value] of Object.entries(evidence)){
    if(!isFdi(fdi)||!value)continue;
    const entry=statuses[fdi]??{level:'watch' as const,items:[]};
    if(showConditions.checked)entry.evidence=value;
    statuses[fdi]=entry;
  }
  for(const f of report?.findings??[]){
    if(!f.atlas_fdi||f.decision!=='positive')continue;
    const kind=kindForCode(f.code);if(kind)(map[f.atlas_fdi]??=[]).push({kind,origin:'ai'});
  }
  for(const [fdi,items] of Object.entries(manualConditions)){
    if(!isFdi(fdi)||!items)continue;
    (map[fdi]??=[]).push(...items);
    const current=statuses[fdi]??{level:'info' as const,items:[]};
    current.items.push(...items.map(c=>`MANUAL SIMULATION: ${CONDITION_LABELS[c.kind]} (not detected)`));statuses[fdi]=current;
    if(showConditions.checked)current.evidence={kind:'manual',label:`SIMULATED: ${items.map(c=>CONDITION_LABELS[c.kind]).join(', ')}`};
  }
  viewer.setStatus(statuses);viewer.setConditions(showConditions.checked?map:{});
  const count=report?.findings?.length??0;
  const manual=Object.values(manualConditions).reduce((n,x)=>n+(x?.length??0),0);
  element('condition-summary').textContent=`${report?.findings_analysis?.available?`${count} provisional 2D finding(s); ${report.findings_analysis.unassigned_count??0} without an unambiguous atlas link.`:'No linked disease-model results loaded.'} ${manual} manual example(s). ${showConditions.checked?'3D effects are schematic.':'Condition effects hidden.'}`;
  const shortcuts=element('atlas-finding-shortcuts');shortcuts.replaceChildren();
  for(const [fdi,value] of Object.entries(evidence)){
    if(!isFdi(fdi)||!value)continue;
    const button=document.createElement('button');button.className='finding-shortcut';button.dataset.evidence=value.kind;
    button.textContent=`${fdi} · ${value.label}`;button.onclick=()=>viewer.select(fdi,true);shortcuts.append(button);
  }
  const positive=Object.values(evidence).filter(x=>x?.kind==='positive').length;
  const uncertain=Object.values(evidence).filter(x=>x?.kind==='uncertain').length;
  element('atlas-health-state').textContent=report?.findings_analysis?.available?`${positive} flagged · ${uncertain} uncertain · ${report.findings_analysis.unassigned_count??0} unlinked`:!hosting.apiBase?'Offline · manual simulations & report review':'Health unassessed · run finding analysis';
  renderConditionInspector();
}

simulationTooth.onchange=()=>{if(isFdi(simulationTooth.value))viewer.select(simulationTooth.value,true);else viewer.select(null);};
element('apply-simulation').onclick=()=>{
  if(!selected)return;const kind=simulationKind.value as ConditionKind;
  const previous=manualConditions[selected]??[];
  if(!previous.some(c=>c.kind===kind))manualConditions[selected]=kind==='missing'?[{kind,origin:'manual'}]:[...previous.filter(c=>c.kind!=='missing'),{kind,origin:'manual'}];
  updateConditionView();
};
element('clear-simulation').onclick=()=>{if(selected)delete manualConditions[selected];updateConditionView();};
element('clear-all-simulations').onclick=()=>{manualConditions={};updateConditionView();};
showConditions.onchange=updateConditionView;

function restoreScenario(value:any){
  manualConditions={};const scenario=value.visualization_scenario;if(!scenario)return;
  if(scenario.version!==1||scenario.patient_specific_3d!==false||!scenario.manual_conditions||typeof scenario.manual_conditions!=='object')throw Error('Invalid manual simulation scenario.');
  for(const [fdi,items] of Object.entries(scenario.manual_conditions)){
    if(!isFdi(fdi)||!Array.isArray(items)||items.length>6||items.some(c=>!c||c.origin!=='manual'||!Object.hasOwn(CONDITION_LABELS,c.kind)))throw Error('Invalid manual simulation scenario.');
    manualConditions[fdi]=items.map(c=>({kind:c.kind,origin:'manual'}));
  }
}

function render() {
  if(!image)return;
  stage.replaceChildren(image);stage.classList.add('has-image');
  list.replaceChildren();
  const statuses:Partial<Record<Fdi,{level:'info'|'watch'|'act';items:string[]}>>={};
  for (const m of report?.mappings??[]) {
    const button=document.createElement('button');button.className='tooth-box';
    button.style.left=`${m.bbox[0]*100}%`;button.style.top=`${m.bbox[1]*100}%`;
    button.style.width=`${(m.bbox[2]-m.bbox[0])*100}%`;button.style.height=`${(m.bbox[3]-m.bbox[1])*100}%`;
    button.textContent=m.fdi??'?';button.title=`${m.observation_id}: tooth ${m.fdi??'unresolved'}, ${m.requires_review?'requires review':'reviewed'}`;
    if(m.fdi)button.dataset.fdi=m.fdi;
    button.onclick=()=>{if(m.fdi&&isFdi(m.fdi))viewer.select(m.fdi,true);};stage.append(button);
    const item=document.createElement('button');item.className='observation';
    item.textContent=`${m.fdi??'?'} · ${(m.identity_score*100).toFixed(0)}%${m.requires_review?' · review':''}`;
    if(m.fdi)item.dataset.fdi=m.fdi;
    item.onclick=button.onclick;list.append(item);
    if(m.fdi&&isFdi(m.fdi))statuses[m.fdi]={level:'watch',items:[...m.findings_2d,'2D correspondence — awaiting review']};
  }
  if(presenceReport){
    for(const h of presenceReport.hypotheses.slice(0,10)){
      const item=document.createElement('button');item.className='observation';item.dataset.fdi=h.fdi;item.textContent=`${h.fdi} · ${(h.visibility_score*100).toFixed(0)}% · image hypothesis`;
      item.onclick=()=>{if(isFdi(h.fdi))viewer.select(h.fdi,true);};list.append(item);
      if(isFdi(h.fdi))statuses[h.fdi]={level:'watch',items:['Image-level visibility hypothesis; localization unavailable']};
    }
  }
  element('match-count').textContent=`${report?.mappings.length??0} linked observations`;
  if(presenceReport)element('match-count').textContent='Image-level hypotheses · no tooth boxes';
  download.disabled=!report&&!presenceReport;updateConditionView();highlight();
}

async function validate(value:any):Promise<Report> {
  if(value?.schema_version!=='atlas-match-1.0'||value.patient_specific_3d!==false||!Array.isArray(value.mappings)||value.mappings.length>64)throw Error('Load an atlas-match-1.0 report from the matching API.');
  if(!image||value.image_size?.[0]!==image.naturalWidth||value.image_size?.[1]!==image.naturalHeight)throw Error('Report dimensions must match the open X-ray.');
  const catalog=await atlasMetadata;if(value.atlas?.model_sha256!==catalog.model_sha256)throw Error('Report refers to a different atlas asset.');
  for(const m of value.mappings){
    if(m.fdi!==null&&!isFdi(m.fdi))throw Error('Report contains an invalid tooth identity.');
    if(!Array.isArray(m.bbox)||m.bbox.length!==4||m.bbox.some((x:any)=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)||m.bbox[0]>=m.bbox[2]||m.bbox[1]>=m.bbox[3])throw Error('Report contains an invalid box.');
    if(!Number.isFinite(m.identity_score)||m.identity_score<0||m.identity_score>1||!Array.isArray(m.findings_2d)||!Array.isArray(m.review_reasons)||!m.findings_2d.every((x:any)=>typeof x==='string')||!m.review_reasons.every((x:any)=>typeof x==='string'))throw Error('Invalid report fields.');
  }
  if(value.findings!==undefined){
    if(!Array.isArray(value.findings)||value.findings.length>256||value.findings.some((f:any)=>!f||typeof f.id!=='string'||typeof f.code!=='string'||f.code.length>100||!Number.isFinite(f.score)||f.score<0||f.score>1||!['positive','uncertain'].includes(f.decision)||(f.atlas_fdi!==null&&!isFdi(f.atlas_fdi))||!f.box||['x','y','w','h'].some(k=>!Number.isFinite(f.box[k])||f.box[k]<0||f.box[k]>1)||f.box.w<=0||f.box.h<=0||f.box.x+f.box.w>1.00001||f.box.y+f.box.h>1.00001))throw Error('Invalid 2D finding evidence.');
  }
  return value;
}

async function validatePresence(value:any) {
  const catalog=await atlasMetadata;
  if(value.schema_version!=='atlas-presence-1.0'||value.atlas?.model_sha256!==catalog.model_sha256||value.patient_specific_3d!==false||!Array.isArray(value.hypotheses)||value.hypotheses.length!==32)throw Error('Unexpected presence report.');
  if(!image||value.image_size?.[0]!==image.naturalWidth||value.image_size?.[1]!==image.naturalHeight)throw Error('Report dimensions must match the open X-ray.');
  if(!value.hypotheses.every((h:any)=>isFdi(h.fdi)&&Number.isFinite(h.visibility_score)&&h.visibility_score>=0&&h.visibility_score<=1&&h.bbox===null))throw Error('Invalid visibility hypotheses.');
  return value;
}

element<HTMLInputElement>('image-file').onchange=async(event)=>{
  file=(event.target as HTMLInputElement).files?.[0]??null;if(!file)return;
  if(file.size>12*1024*1024){status.textContent='Use an image smaller than 12 MiB.';file=null;return;}
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);
  const next=new Image();next.alt='Panoramic X-ray with selectable tooth observations';next.src=objectUrl;
  try{await next.decode();image=next;report=null;presenceReport=null;manualConditions={};analyze.disabled=!hosting.apiBase;presenceButton.disabled=!hosting.apiBase||modality.value!=='periapical';render();status.textContent=hosting.apiBase?'Image loaded. Choose its modality, then use a configured model or load an atlas report.':'Image loaded locally. Load an atlas report or use manual examples. Automatic analysis needs a connected backend.';}
  catch{status.textContent='This image could not be decoded.';file=null;}
};
analyze.onclick=async()=>{
  if(!file)return;analyze.disabled=true;status.textContent='Detecting teeth and available 2D findings, then linking reference anatomy…';
  try{
    const form=new FormData();form.set('file',file);form.set('modality',modality.value);form.set('orientation',modality.value==='panoramic'?'standard_panorama':modality.value==='cbct_slice'?'native_slice':modality.value==='cephalometric'?'standard_cephalometric':'standard_intraoral');
    const response=await fetch(apiUrl('analyze'),{method:'POST',body:form});const value=await response.json();
    if(!response.ok)throw Error(typeof value.detail==='string'?value.detail:value.detail?.message??'Analysis failed.');
    report=await validate(value);presenceReport=null;render();status.textContent=value.findings_analysis?.available?'Tooth links and 2D finding models applied. Review all results. 3D condition effects are illustrative.':value.learned_identity_refinement_used?'Candidate identity encoder applied. Review all links.':'FDI detector linked to atlas. Learned refinement is not enabled; review all links.';
  }catch(error){status.textContent=(error as Error).message;}finally{analyze.disabled=!hosting.apiBase;}
};
element<HTMLInputElement>('report-file').onchange=async(event)=>{
  const input=(event.target as HTMLInputElement).files?.[0];if(!input)return;
  try{if(input.size>2*1024*1024)throw Error('Report is too large.');const value=JSON.parse(await input.text());if(value.schema_version==='atlas-presence-1.0'){presenceReport=await validatePresence(value);report=null;}else{report=await validate(value);presenceReport=null;}restoreScenario(value);render();status.textContent='Report loaded. Review its image and atlas scope. Manual simulations remain separate from AI evidence.';}
  catch(error){status.textContent=(error as Error).message;}
};
download.onclick=()=>{
  if(!report&&!presenceReport)return;
  const saved={...(report??presenceReport),visualization_scenario:{version:1,patient_specific_3d:false,manual_conditions:manualConditions,note:'Illustrative manual examples; not model findings or clinical measurements.'}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='atlas-match.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
modality.onchange=()=>{presenceButton.disabled=!hosting.apiBase||!file||modality.value!=='periapical';report=null;presenceReport=null;manualConditions={};render();status.textContent=hosting.apiBase?'Models are separate for each modality. Unconfigured paths return an availability message.':'Offline atlas: use manual simulations or a report. Automatic models require a hosted backend.';};
presenceButton.onclick=async()=>{
  if(!file)return;presenceButton.disabled=true;status.textContent='Estimating image-level tooth visibility…';
  try{
    const form=new FormData();form.set('file',file);form.set('modality',modality.value);form.set('orientation','standard_intraoral');
    const response=await fetch(apiUrl('presence'),{method:'POST',body:form});const value=await response.json();
    if(!response.ok)throw Error(typeof value.detail==='string'?value.detail:value.detail?.message??'Model unavailable.');
    presenceReport=await validatePresence(value);report=null;render();status.textContent='Image-level hypotheses only. Individual tooth locations are not assigned.';
  }catch(error){status.textContent=(error as Error).message;}finally{presenceButton.disabled=!hosting.apiBase;}
};
element('example').onclick=async()=>{
  try{
    status.textContent='Loading a public validation image and candidate detector report…';
    const isPresence=Boolean(hosting.apiBase)&&modality.value==='periapical';const suffix=isPresence?'_periapical':'';
    const response=await fetch(hosting.apiBase?apiUrl(`demo/image${suffix}.png`):hosting.staticExampleImage);if(!response.ok)throw Error('Example unavailable.');
    const blob=await response.blob();file=new File([blob],'research-example.png',{type:'image/png'});
    if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);
    const next=new Image();next.alt=hosting.apiBase?'Public validation X-ray, for pipeline demonstration only':'Synthetic dental illustration with manual example scenarios; no model detections';next.src=objectUrl;await next.decode();image=next;
    const value=await(await fetch(hosting.apiBase?apiUrl(`demo/report${suffix}.json`):hosting.staticExampleReport)).json();
    if(isPresence){presenceReport=await validatePresence(value);report=null;modality.value='periapical';}else{report=await validate(value);presenceReport=null;modality.value='panoramic';}
    restoreScenario(value);analyze.disabled=!hosting.apiBase;presenceButton.disabled=!hosting.apiBase||!isPresence;render();
    status.textContent=!hosting.apiBase?'Synthetic illustration + manual simulations. No automatic detection or patient-specific reconstruction.':isPresence?'DenPAR validation example · image-level visibility hypotheses, without spatial localization.':'Public validation example · candidate detector · demonstration only. Select a tooth to inspect its atlas link.';
  }catch(error){status.textContent=(error as Error).message;}
};
if(new URLSearchParams(location.search).has('example'))element('example').click();
