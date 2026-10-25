const ORIGIN = 'https://dhruvyu.github.io';
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function identity(request,env){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const bytes=new TextEncoder().encode(ip);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function payload(request){if(Number(request.headers.get('content-length')||0)>4096)throw Error('Request too large');const raw=await request.text();if(raw.length>4096)throw Error('Request too large');return JSON.parse(raw)}
// Server-side filtering ensures visitors cannot bypass censorship by editing the browser.
const DEFAULT_BLOCKED = ['nigger','nigga','faggot','fag','kike','chink','spic','retard','tranny'];
function censorSlurs(input, extra='') {
  const terms = [...DEFAULT_BLOCKED, ...extra.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)];
  return terms.reduce((text, term) => {
    if (!/^[a-z0-9]+$/.test(term)) return text;
    const pattern = new RegExp('(^|[^a-z0-9])(' + term + ')(?=$|[^a-z0-9])', 'gi');
    return text.replace(pattern, (_, prefix, match) => prefix + '*'.repeat(match.length));
  }, input);
}
export default {async fetch(request,env){
  const origin=request.headers.get('Origin');
  if(origin&&origin!==ORIGIN)return reply({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET,POST','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'86400'}});
  if(!env.DB||!env.HASH_SECRET)return reply({error:'Backend not configured'},503);
  const path=new URL(request.url).pathname;
  const match=/^\/chapters\/(\d+)(?:\/(rating|comments|reports))?$/.exec(path);
  try{
    if(path==='/admin/comments'){
      if(!env.ADMIN_TOKEN||request.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN)return reply({error:'Unauthorized'},401);
      if(request.method==='GET'){
        const data=await env.DB.prepare("SELECT id,chapter,nickname,body,status,created_at FROM comments WHERE status='pending' ORDER BY created_at DESC LIMIT 100").all();
        return reply({comments:data.results});
      }
      if(request.method==='POST'){
        const data=await payload(request);
        if(!Number.isSafeInteger(data.id)||!['approved','rejected'].includes(data.status))return reply({error:'Invalid moderation request'},400);
        const result=await env.DB.prepare('UPDATE comments SET status=? WHERE id=?').bind(data.status,data.id).run();
        return reply({updated:result.meta.changes});
      }
      return reply({error:'Method not allowed'},405);
    }
    if(path==='/admin/reports'){
      if(!env.ADMIN_TOKEN||request.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN)return reply({error:'Unauthorized'},401);
      if(request.method!=='GET')return reply({error:'Method not allowed'},405);
      const reports=await env.DB.prepare("SELECT r.comment_id,r.reason,r.created_at,c.chapter,c.nickname,c.body,c.status FROM comment_reports r JOIN comments c ON c.id=r.comment_id ORDER BY r.created_at DESC LIMIT 200").all();
      return reply({reports:reports.results});
    }
    if(!match)return reply({error:'Not found'},404);
    const chapter=Number(match[1]),action=match[2];
    if(!Number.isSafeInteger(chapter)||chapter<1||chapter>10000)return reply({error:'Invalid chapter'},400);
    if(request.method==='GET'&&!action){
      const [rating,comments]=await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS count, AVG(rating) AS average FROM ratings WHERE chapter=?').bind(chapter).first(),
        env.DB.prepare("SELECT c.id,c.nickname,c.body,c.created_at,d.parent_id,COALESCE(d.spoiler,0) AS spoiler FROM comments c LEFT JOIN comment_details d ON d.comment_id=c.id WHERE c.chapter=? AND c.status='approved' ORDER BY c.created_at ASC LIMIT 100").bind(chapter).all()
      ]);
      return reply({rating:{count:rating.count,average:rating.average||0},comments:comments.results});
    }
    if(request.method!=='POST')return reply({error:'Method not allowed'},405);
    const hash=await identity(request,env),data=await payload(request);
    if(action==='rating'){
      if(!Number.isInteger(data.rating)||data.rating<1||data.rating>5)return reply({error:'Choose 1–5 stars'},400);
      const prior=await env.DB.prepare('SELECT updated_at FROM ratings WHERE chapter=? AND visitor_hash=?').bind(chapter,hash).first();
      if(prior&&Date.now()-Date.parse(prior.updated_at.replace(' ','T')+'Z')<60000)return reply({error:'Please wait before changing your rating'},429);
      await env.DB.prepare("INSERT INTO ratings(chapter,visitor_hash,rating) VALUES(?,?,?) ON CONFLICT(chapter,visitor_hash) DO UPDATE SET rating=excluded.rating,updated_at=CURRENT_TIMESTAMP").bind(chapter,hash,data.rating).run();
      return reply({ok:true});
    }
    if(action==='reports'){
      if(!Number.isSafeInteger(data.commentId)||data.commentId<1)return reply({error:'Invalid comment'},400);
      if(!['spam','harassment','spoiler','other'].includes(data.reason))return reply({error:'Invalid report reason'},400);
      const comment=await env.DB.prepare("SELECT id FROM comments WHERE id=? AND chapter=? AND status='approved'").bind(data.commentId,chapter).first();
      if(!comment)return reply({error:'Comment not found'},404);
      await env.DB.prepare("INSERT OR IGNORE INTO comment_reports(comment_id,reporter_hash,reason) VALUES(?,?,?)").bind(data.commentId,hash,data.reason).run();
      return reply({ok:true});
    }
    if(action==='comments'){
      if(data.website)return reply({ok:true},202);
      const nickname=typeof data.nickname==='string'?data.nickname.trim():'';
      const body=typeof data.body==='string'?data.body.trim():'';
      if(nickname.length<2||nickname.length>32||body.length<3||body.length>1000)return reply({error:'Nickname must be 2–32 characters and comment 3–1000 characters'},400);
      const parentId=data.parentId==null?null:Number(data.parentId);
      if(parentId!==null){
        if(!Number.isSafeInteger(parentId)||parentId<1)return reply({error:'Invalid reply target'},400);
        const parent=await env.DB.prepare("SELECT c.id,d.parent_id FROM comments c LEFT JOIN comment_details d ON d.comment_id=c.id WHERE c.id=? AND c.chapter=? AND c.status='approved'").bind(parentId,chapter).first();
        if(!parent||parent.parent_id!=null)return reply({error:'Reply target unavailable'},400);
      }
      const spoiler=data.spoiler===true?1:0;
      const recent=await env.DB.prepare("SELECT COUNT(*) AS count FROM comments WHERE visitor_hash=? AND created_at > datetime('now','-10 minutes')").bind(hash).first();
      if(recent.count>=2)return reply({error:'Please wait before commenting again'},429);
      const inserted=await env.DB.prepare("INSERT INTO comments(chapter,nickname,body,visitor_hash,status) VALUES(?,?,?,?,'approved')").bind(chapter,censorSlurs(nickname,env.EXTRA_BLOCKED_WORDS||''),censorSlurs(body,env.EXTRA_BLOCKED_WORDS||''),hash).run();
      await env.DB.prepare("INSERT INTO comment_details(comment_id,parent_id,spoiler) VALUES(?,?,?)").bind(inserted.meta.last_row_id,parentId,spoiler).run();
      return reply({ok:true,pending:false},201);
    }
    return reply({error:'Not found'},404);
  }catch(e){console.error('Feedback request failed', {path, method:request.method, error:e instanceof Error?e.message:String(e)});return reply({error:e instanceof SyntaxError?'Invalid JSON':'Request could not be processed'},400)}
}};
