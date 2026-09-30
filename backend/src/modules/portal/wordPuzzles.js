const sets=[
 // Early years / Classes 1-2: short, familiar words.
 {min:1,max:2,letters:'ATEH',words:['AT','HE','EAT','TEA','HAT','THE','HATE','HEAT']},
 {min:1,max:2,letters:'CATS',words:['AT','AS','CAT','ACT','SAT','CAST','CATS']},
 {min:1,max:3,letters:'DOGS',words:['DO','GO','SO','DOG','GOD','SOD','DOGS']},
 {min:1,max:3,letters:'RATE',words:['AT','ARE','ART','ATE','EAR','EAT','RAT','TEA','RATE','TEAR']},

 // Primary classes: more combinations while keeping common school vocabulary.
 {min:3,max:4,letters:'STOP',words:['TO','SO','TOP','POT','SOP','POST','POTS','STOP','TOPS']},
 {min:3,max:5,letters:'PLANT',words:['AT','AN','ANT','LAP','NAP','PAL','PAN','PAT','TAN','TAP','PLAN','PANT','PLANT']},
 {min:3,max:5,letters:'CARE',words:['ARE','ARC','CAR','EAR','ERA','ACE','CARE','RACE']},
 {min:4,max:6,letters:'STONE',words:['NO','ON','SO','TO','ONE','SON','TEN','TON','NOT','SET','NET','NOTE','TONE','STONE']},
 {min:4,max:6,letters:'TRAIN',words:['AN','AT','IN','IT','AIR','ANT','ART','RAN','RAT','TIN','RAIN','TRAIN']},

 // Middle classes: longer words and a broader set of common derivatives/anagrams.
 {min:6,max:8,letters:'STREAM',words:['AM','AS','AT','ME','ARE','ART','ATE','EAR','EAT','MAT','MET','RAT','SAT','SEA','SET','TEA','RATE','STAR','TEAM','TERM','STEAM','TAMER','MASTER','STREAM']},
 {min:6,max:8,letters:'GARDEN',words:['AN','ARE','AGE','AND','DEN','END','RED','RAN','DEAR','DARE','READ','GEAR','NEAR','RAGE','GRADE','RANGE','GARDEN','DANGER']},
 {min:7,max:9,letters:'PLANET',words:['AN','AT','ATE','EAT','LET','NET','PAN','PEN','PET','TEA','LATE','LEAN','LEAP','PALE','PANE','PLAN','PLANT','PLATE','PANEL','PLANE','PLANET']},
 {min:8,max:10,letters:'TEACHER',words:['AT','HE','HER','THE','ACE','ACT','ARE','ART','ATE','CAR','CAT','EAR','EAT','TEA','EACH','HEAR','HEAT','RACE','RATE','TEAR','REACH','TEACH','CHEAT','TEACHER']},

 // Senior classes: larger letter sets, still curated to recognizable English words.
 {min:9,max:12,letters:'CREATION',words:['AN','AT','IN','IT','NO','ON','TO','ACE','ACT','ANT','ARE','ART','ATE','CAN','CAR','CAT','EAR','EAT','ICE','NET','NOT','ONE','RAN','RAT','TEN','TIE','TIN','TON','RAIN','RATE','TEAR','TRAIN','TRACE','CRATE','REACT','ACTION','REACTION','CREATION']},
 {min:9,max:12,letters:'LEARNING',words:['AN','IN','AGE','AIR','EAR','ERA','LEG','LIE','RAN','RING','GAIN','GEAR','LEAN','LINE','NEAR','REAL','REIGN','LEARN','ANGLE','GRAIN','LARGE','RANGE','LINEAR','LEARNING']},
 {min:10,max:12,letters:'EDUCATION',words:['AN','AT','DO','IN','IT','NO','ON','TO','ACE','ACT','AND','ANT','ATE','CAN','CAT','DEN','DIE','DIN','DUE','EAT','END','ICE','NET','NOT','ONE','TEN','TIE','TIN','TON','UNIT','DATE','DINE','EDIT','IDEA','NOTE','TONE','ACTION','EDUCATION']}
];

function level(name=''){
 const s=String(name).toLowerCase();
 const m=s.match(/(?:class|grade)\s*(\d{1,2})/)||s.match(/\b(1[0-2]|[1-9])(?:st|nd|rd|th)?\b/);
 if(m)return Math.max(1,Math.min(12,+m[1]));
 if(/nursery|playgroup|kg|prep/.test(s))return 1;
 return 5;
}
function hash(v){return String(v).split('').reduce((a,c)=>((a*31)+c.charCodeAt(0))>>>0,7)}
function puzzle(classLevel,dateKey){
 const pool=sets.filter(x=>classLevel>=x.min&&classLevel<=x.max);
 const selected=(pool.length?pool:sets)[hash(`${dateKey}:${classLevel}`)%(pool.length||sets.length)];
 // Keep the answer rows deterministic and easiest-to-hardest.
 return {...selected,words:[...new Set(selected.words.map(w=>w.toUpperCase()))].sort((a,b)=>a.length-b.length||a.localeCompare(b))};
}
module.exports={level,puzzle};
