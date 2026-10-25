/* Configure after deploying the Cloudflare Worker. Leave blank to show setup notice. */
const FEEDBACK_API = "https://umbrella-feedback.dhruvgooljar.workers.dev";
window.chapterFeedback = {
  async mount(end, chapter) {
    const root = document.createElement('section');
    root.className = 'feedback';
    root.setAttribute('aria-label', 'Chapter comments and ratings');
    root.innerHTML = '<h3>Rate this chapter</h3><div class="feedback-stars" role="group" aria-label="Your rating"></div><p class="feedback-average" aria-live="polite">Loading ratings…</p><h3>Reader comments</h3><div class="feedback-comments" aria-live="polite"></div><form class="feedback-form"><label>Nickname <input name="nickname" maxlength="32" required autocomplete="nickname"></label><label class="feedback-reply-target" hidden></label><label>Your comment <textarea name="body" maxlength="1000" rows="4" required></textarea></label><label class="feedback-spoiler"><input type="checkbox" name="spoiler"> Contains spoilers (hide until revealed)</label><input type="hidden" name="parentId"><input class="feedback-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Post comment</button><p class="feedback-status" role="status"></p></form>';
    end.appendChild(root);
    const average = root.querySelector('.feedback-average'), comments = root.querySelector('.feedback-comments'), status = root.querySelector('.feedback-status');
    if (!FEEDBACK_API) {
      average.textContent = 'Ratings and comments will be available soon.';
      root.querySelector('.feedback-form').hidden = true;
      return;
    }
    const url = FEEDBACK_API.replace(/\/$/, '') + '/chapters/' + chapter;
    let selected = 0;
    const form = root.querySelector('form');
    const replyTarget=form.querySelector('.feedback-reply-target');
    function setReply(id,name){form.elements.parentId.value=id||'';replyTarget.hidden=!id;replyTarget.textContent=id?'Replying to '+name+' · Tap here to cancel':'';form.scrollIntoView({behavior:'smooth',block:'center'});}
    replyTarget.onclick=()=>setReply(null,'');
    const stars = root.querySelector('.feedback-stars');
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '☆'; b.setAttribute('aria-label', i + ' stars');
      b.onclick = async () => {
        selected = i; paint(); b.disabled = true;
        try {
          const response = await fetch(url + '/rating', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({rating:i})});
          const data = await response.json();
          if (!response.ok) throw Error(data.error || 'Could not save rating');
          status.textContent = 'Thanks for rating!';
          await refresh();
        } catch(e) { status.textContent = e.message; } finally { b.disabled = false; }
      };
      stars.appendChild(b);
    }
    function paint(){[...stars.children].forEach((b,i)=>{b.textContent=i<selected?'★':'☆';b.setAttribute('aria-pressed',String(i+1===selected));});}
    async function refresh(){
      try {
        const response = await fetch(url);
        if(!response.ok) throw Error('Unable to load feedback');
        const data = await response.json();
        average.textContent = data.rating.count ? Number(data.rating.average).toFixed(1) + ' / 5 · ' + data.rating.count + ' ratings' : 'No ratings yet';
        comments.replaceChildren();
        if(!data.comments.length) comments.textContent = 'No comments yet. Be the first!';
        const nodes=new Map();
        for(const c of data.comments){
          const item=document.createElement('article');item.className='feedback-comment';
          const name=document.createElement('strong');name.textContent=c.nickname;
          const date=document.createElement('time');date.textContent=new Date(c.created_at+'Z').toLocaleDateString();
          const body=document.createElement('p');body.textContent=c.body;
          if(c.spoiler){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Spoiler — tap to reveal';details.append(summary,body);item.append(name,date,details);}
          else item.append(name,date,body);
          const actions=document.createElement('div');actions.className='feedback-actions';
          if(!c.parent_id){const reply=document.createElement('button');reply.type='button';reply.textContent='Reply';reply.onclick=()=>setReply(c.id,c.nickname);actions.appendChild(reply);}
          const report=document.createElement('button');report.type='button';report.textContent='Report';
          const reportMessage=document.createElement('p');
          reportMessage.className='feedback-report-message';
          reportMessage.setAttribute('role','status');
          reportMessage.setAttribute('aria-live','polite');
          report.onclick=async()=>{
            const reason=window.prompt('Report reason: spam, harassment, spoiler, or other');
            if(reason===null)return;
            const chosen=reason.trim().toLowerCase();
            if(!['spam','harassment','spoiler','other'].includes(chosen)){reportMessage.textContent='Choose spam, harassment, spoiler, or other.';return;}
            report.disabled=true;
            reportMessage.textContent='Sending report…';
            try{
              const res=await fetch(url+'/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commentId:c.id,reason:chosen})});
              const data=await res.json();
              if(!res.ok)throw Error(data.error||'Could not report');
              reportMessage.textContent='Report received. Thank you.';
            }catch(e){reportMessage.textContent=e.message||'Could not send report.';}
            finally{report.disabled=false;}
          };actions.appendChild(report);item.append(actions,reportMessage);nodes.set(c.id,item);
        }
        for(const c of data.comments){const item=nodes.get(c.id);if(c.parent_id&&nodes.has(c.parent_id)){item.classList.add('feedback-reply');nodes.get(c.parent_id).appendChild(item);}else comments.appendChild(item);}

      } catch(e){average.textContent=e.message;comments.textContent='Comments unavailable right now.';}
    }
    root.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();
      const form=e.currentTarget, button=form.querySelector('button'), fields=new FormData(form);
      button.disabled=true;status.textContent='Submitting…';
      try {
        const response=await fetch(url+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:fields.get('nickname'),body:fields.get('body'),website:fields.get('website'),spoiler:fields.get('spoiler')==='on',parentId:fields.get('parentId')?Number(fields.get('parentId')):null})});
        const data=await response.json();
        if(!response.ok) throw Error(data.error||'Unable to post comment');
        form.reset();replyTarget.hidden=true;status.textContent='Comment posted! Thank you!';await refresh();
      } catch(err){status.textContent=err.message;} finally {button.disabled=false;}
    });
    await refresh();
  }
};
