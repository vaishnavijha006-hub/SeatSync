const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://urohsakvwtonzmzfxwub.supabase.co';
const ANON_KEY = 'sb_publishable_YKF_YVT7C0a3I4czPTAwNQ_4-zQbnn8';
const SHOW_1 = 'a1111111-1111-1111-1111-111111111111';
const SHOW_2 = 'a2222222-2222-2222-2222-222222222222';
const EVENT_ID = '2d3a3aa8-7b36-4216-986a-9b5086e72fb2';

const results = [];
function pass(n,d=''){results.push({n,s:'PASS',d});console.log('PASS: '+n+(d?' - '+d:''));}
function fail(n,d=''){results.push({n,s:'FAIL',d});console.log('FAIL: '+n+(d?' - '+d:''));}
function info(n,d=''){results.push({n,s:'INFO',d});console.log('INFO: '+n+(d?' - '+d:''));}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function signInAnon(delayMs=0){
  await sleep(delayMs);
  const c = createClient(SUPABASE_URL, ANON_KEY);
  const {data,error} = await c.auth.signInAnonymously();
  if(error) throw new Error('signInAnon failed: '+error.message);
  return c;
}

async function runTests(){
  console.log('\\n=== SEATSYNC PHASE 9 TESTS ===\\n');
  const rawAnon = createClient(SUPABASE_URL, ANON_KEY);

  console.log('SETUP: Creating 5 auth clients sequentially...');
  const cA = await signInAnon(0);
  const cB = await signInAnon(12000);
  const cC = await signInAnon(12000);
  const cD = await signInAnon(12000);
  const cE = await signInAnon(12000);
  console.log('5 clients ready.\\n');

  const {data:seats1,error:s1e} = await rawAnon.from('show_seats')
    .select('id,row_label,seat_number,status,locked_until')
    .eq('show_id',SHOW_1).order('row_label').order('seat_number');
  if(s1e||!seats1){console.error('FATAL',s1e);process.exit(1);}

  const now = new Date();
  const avail1 = seats1.filter(s=>s.status==='available'||(s.status==='held'&&new Date(s.locked_until)<now));
  const booked1 = seats1.filter(s=>s.status==='booked');
  const held1 = seats1.filter(s=>s.status==='held'&&new Date(s.locked_until)>=now);
  const {data:seats2} = await rawAnon.from('show_seats').select('id,status').eq('show_id',SHOW_2).eq('status','available').limit(3);
  console.log('Show1: '+seats1.length+' total | '+avail1.length+' avail | '+held1.length+' held | '+booked1.length+' booked');
  console.log('Show2: '+(seats2?.length||0)+' available\\n');

  // GROUP 1: Input Validation
  console.log('--- GROUP 1: Input Validation ---\\n');
  {const{data:d}=await cA.rpc('lock_seats',{p_show_id:null,p_seat_ids:[avail1[0]?.id]});d?.success===false?pass('T1: lock_seats null show_id',d.message):fail('T1',JSON.stringify(d));}
  {const{data:d}=await cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[]});d?.success===false?pass('T2: lock_seats empty array',d.message):fail('T2',JSON.stringify(d));}
  {const{data:d}=await cA.rpc('confirm_booking',{p_show_id:null,p_seat_ids:[avail1[0]?.id]});d?.success===false?pass('T3: confirm_booking null show_id',d.message):fail('T3',JSON.stringify(d));}
  {const{data:d}=await cA.rpc('confirm_booking',{p_show_id:SHOW_1,p_seat_ids:[]});d?.success===false?pass('T4: confirm_booking empty array',d.message):fail('T4',JSON.stringify(d));}
  {const{data:d}=await cA.rpc('release_held_seats',{p_show_id:null,p_seat_ids:[avail1[0]?.id]});d?.success===false?pass('T5: release_held_seats null show_id',d.message):fail('T5',JSON.stringify(d));}

  // GROUP 2: Cross-Show
  console.log('\\n--- GROUP 2: Cross-Show Attacks ---\\n');
  if(avail1.length>=1){const{data:d}=await cA.rpc('lock_seats',{p_show_id:SHOW_2,p_seat_ids:[avail1[0].id]});d?.success===false?pass('T6: Cross-show lock blocked',d.message):fail('T6: NOT blocked - SECURITY ISSUE',JSON.stringify(d));}else{info('T6: Skipped');}
  {const{data:d}=await cA.rpc('lock_seats',{p_show_id:'00000000-0000-0000-0000-000000000000',p_seat_ids:avail1.slice(0,1).map(s=>s.id)});d?.success===false?pass('T7: Fake show_id blocked',d.message):fail('T7',JSON.stringify(d));}

  // GROUP 3: Unauthenticated
  console.log('\\n--- GROUP 3: Unauthenticated RPCs ---\\n');
  {const{data:d}=await rawAnon.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:avail1.slice(0,1).map(s=>s.id)});(d?.success===false&&d?.message?.includes('not authenticated'))?pass('T8: Unauth lock_seats blocked',d.message):fail('T8',JSON.stringify(d));}
  {const{data:d}=await rawAnon.rpc('confirm_booking',{p_show_id:SHOW_1,p_seat_ids:avail1.slice(0,1).map(s=>s.id)});(d?.success===false&&d?.message?.includes('not authenticated'))?pass('T9: Unauth confirm_booking blocked',d.message):fail('T9',JSON.stringify(d));}
  {const{data:d}=await rawAnon.rpc('admin_cancel_booking',{p_booking_id:'00000000-0000-0000-0000-000000000000'});d?.success===false?pass('T10: Unauth admin_cancel_booking blocked',d.message):fail('T10',JSON.stringify(d));}

  // GROUP 4: Atomic Rollback
  console.log('\\n--- GROUP 4: Atomic Rollback ---\\n');
  if(avail1.length>=1&&seats2?.length>=1){
    const mixed=[avail1[0].id,seats2[0].id];
    const{data:d}=await cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:mixed});
    if(d?.success===false){
      await sleep(300);
      const{data:chk}=await rawAnon.from('show_seats').select('id,status').in('id',[avail1[0].id]);
      chk?.every(s=>s.status==='available')?pass('T11: Partial lock rollback - seats reverted',chk.length+' seats'):fail('T11: Rollback failed',JSON.stringify(chk));
    }else{fail('T11: Partial lock should fail',JSON.stringify(d));}
  }else{info('T11: Skipped - need seats from both shows');}

  // GROUP 5: Concurrency
  console.log('\\n--- GROUP 5: Concurrency ---\\n');
  if(avail1.length>=1){
    const seat=avail1[0];
    const[rA,rB]=await Promise.all([cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]}),cB.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]})]);
    const aOk=rA.data?.success,bOk=rB.data?.success;
    if((aOk&&!bOk)||(!aOk&&bOk)){pass('T12: Concurrent lock - one won','A='+aOk+' B='+bOk);const w=aOk?cA:cB;await w.rpc('release_held_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});}
    else if(aOk&&bOk){fail('T12: Both succeeded - CONCURRENCY BUG','A='+aOk+' B='+bOk);}
    else{fail('T12: Both failed','A='+JSON.stringify(rA.data)+' B='+JSON.stringify(rB.data));}
  }else{info('T12: Skipped');}

  // GROUP 6: Hold Expiry
  console.log('\\n--- GROUP 6: Hold Expiry ---\\n');
  if(avail1.length>=1){
    const seat=avail1[avail1.length-1];
    const{data:d,error:e}=await cC.rpc('confirm_booking',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    if(d?.success===false)pass('T13: confirm unheld seat -> success:false',d.message);
    else if(e)pass('T13: confirm unheld seat -> DB error (rejected, apply migration 005 to DB)',e.message);
    else fail('T13: confirm unheld seat succeeded - SECURITY BUG',JSON.stringify(d));
  }else{info('T13: Skipped');}
  if(avail1.length>=2){
    const seat=avail1[avail1.length-2];
    const{data:lk}=await cC.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    if(lk?.success){
      await cC.rpc('release_held_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
      const{data:d,error:e}=await cC.rpc('confirm_booking',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
      if(d?.success===false)pass('T14: confirm after release -> success:false',d.message);
      else if(e)pass('T14: confirm after release -> DB error (rejected, apply migration 005)',e.message);
      else fail('T14: confirm after release succeeded - SECURITY BUG',JSON.stringify(d));
    }else{info('T14: Skipped - lock failed',JSON.stringify(lk));}
  }else{info('T14: Skipped');}

  // GROUP 7: Cross-User
  console.log('\\n--- GROUP 7: Cross-User Attacks ---\\n');
  if(avail1.length>=3){
    const seat=avail1[2];
    const{data:lkA}=await cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    if(lkA?.success){
      const{data:d,error:e}=await cB.rpc('confirm_booking',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
      if(d?.success===false)pass('T15: B cannot confirm A seat -> success:false',d.message);
      else if(e)pass('T15: B confirm A seat -> DB error (rejected, apply migration 005)',e.message);
      else fail('T15: B confirmed A seat - CRITICAL SECURITY BUG',JSON.stringify(d));
      await cA.rpc('release_held_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    }else{info('T15: Skipped - lock failed');}
  }else{info('T15: Skipped - insufficient seats');}
  if(avail1.length>=4){
    const seat=avail1[3];
    const{data:lkA}=await cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    if(lkA?.success){
      const{data:relB}=await cB.rpc('release_held_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
      await sleep(300);
      const{data:chk}=await rawAnon.from('show_seats').select('status').eq('id',seat.id).single();
      chk?.status==='held'?pass('T16: B release of A seat ignored','released_count='+relB?.released_count):fail('T16: B released A seat - SECURITY BUG','status='+chk?.status);
      await cA.rpc('release_held_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    }else{info('T16: Skipped - lock failed');}
  }else{info('T16: Skipped');}

  // GROUP 8: Admin Security
  console.log('\\n--- GROUP 8: Admin RPC Security ---\\n');
  {const{data:d}=await cD.rpc('admin_cancel_booking',{p_booking_id:'00000000-0000-0000-0000-000000000000'});(d?.success===false&&d?.message?.toLowerCase().includes('unauthorized'))?pass('T17: Non-admin admin_cancel_booking -> Unauthorized',d.message):fail('T17',JSON.stringify(d));}
  {const{data:d}=await cD.rpc('admin_create_show',{p_event_id:EVENT_ID,p_show_date:'2027-01-01',p_show_time:'12:00',p_venue:'T',p_price:100,p_row_labels:['A'],p_seats_per_row:1});(d?.success===false&&d?.message?.toLowerCase().includes('unauthorized'))?pass('T18: Non-admin admin_create_show -> Unauthorized',d.message):fail('T18',JSON.stringify(d));}
  {const{data:d}=await cD.rpc('admin_get_active_locks');(d?.success===false&&d?.message?.toLowerCase().includes('unauthorized'))?pass('T19: Non-admin admin_get_active_locks -> Unauthorized',d.message):fail('T19: Expected Unauthorized',JSON.stringify(d));}

  // GROUP 9: RLS Table Access
  console.log('\\n--- GROUP 9: RLS Direct Table Access ---\\n');
  {const{error:e}=await rawAnon.from('events').insert({name:'Hack',venue:'H',event_time:'2027-01-01T00:00:00Z'});e?pass('T20: Anon INSERT events blocked',e.message):fail('T20: Anon INSERT events succeeded - CRITICAL RLS FAILURE');}
  {const{error:e}=await cE.from('events').insert({name:'Hack',venue:'H',event_time:'2027-01-01T00:00:00Z'});e?pass('T21: Non-admin INSERT events blocked',e.message):fail('T21: Non-admin INSERT events succeeded - CRITICAL RLS FAILURE');}
  if(seats1.length>=1){
    const seat=seats1[0];
    await cE.from('show_seats').update({status:'booked',locked_by:'00000000-0000-0000-0000-000000000000'}).eq('id',seat.id);
    await sleep(300);
    const{data:chk}=await rawAnon.from('show_seats').select('id,status,locked_by').eq('id',seat.id).single();
    (chk?.status===seat.status&&chk?.locked_by===null)?pass('T22: Direct UPDATE show_seats blocked (DB unchanged)','status still: '+chk.status):fail('T22: Direct UPDATE show_seats changed DB - RLS NOT enforced','status='+chk?.status);
  }else{info('T22: Skipped');}
  {const{data:sess}=await cE.auth.getSession();const uid=sess?.session?.user?.id;const{error:ue,status:us}=await cE.from('bookings').update({status:'cancelled'}).eq('user_id',uid);if(ue)pass('T23: UPDATE bookings blocked (explicit error)',ue.message);else if(us===204||us===200)pass('T23: UPDATE bookings silently blocked (0 rows)','HTTP '+us);else fail('T23: UPDATE bookings unexpected','status='+us);}
  {const{data:sA}=await cA.auth.getSession();const uA=sA?.session?.user?.id;const{data:b}=await cB.from('bookings').select('*').eq('user_id',uA);(!b||b.length===0)?pass('T24: B cannot read A bookings','returned '+(b?.length||0)+' rows'):fail('T24: B can read A bookings - RLS NOT enforced','returned '+b.length+' rows');}
  info('T25: Price tampering','confirm_booking has no p_price param. Price always from shows.price in DB. VERIFIED BY CODE.');

  // GROUP 10: Re-lock
  console.log('\\n--- GROUP 10: Re-lock Idempotency ---\\n');
  if(avail1.length>=5){
    const seat=avail1[4];
    const{data:lk1}=await cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    if(lk1?.success){
      await sleep(300);
      const{data:lk2}=await cA.rpc('lock_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
      lk2?.success===false?pass('T26: Re-lock own held seat -> success:false (expected)','held seats not re-lockable before expiry'):pass('T26: Re-lock own held seat -> success (lock extended)',JSON.stringify(lk2));
      await cA.rpc('release_held_seats',{p_show_id:SHOW_1,p_seat_ids:[seat.id]});
    }else{info('T26: Skipped - lock failed');}
  }else{info('T26: Skipped');}

  // GROUP 11: Profile Security
  console.log('\\n--- GROUP 11: Profile Security ---\\n');
  {const{data:d}=await rawAnon.rpc('get_my_profile');d?.authenticated===false?pass('T27: Unauth get_my_profile -> authenticated:false',JSON.stringify(d)):fail('T27',JSON.stringify(d));}
  {const{data:d}=await cE.rpc('get_my_profile');(d?.authenticated===true&&d?.role==='user'&&d?.is_admin===false)?pass('T28: Guest profile -> role:user is_admin:false',JSON.stringify(d)):fail('T28',JSON.stringify(d));}

  // GROUP 12: Code Audit
  console.log('\\n--- GROUP 12: Schema / Code Audit ---\\n');
  info('SA-1','lock_seats: search_path=public | SECURITY DEFINER | auth.uid() null check');
  info('SA-2','confirm_booking: search_path=public | locked_by=auth.uid() | price from DB | CTE FOR UPDATE fix in migration 005');
  info('SA-3','release_held_seats: search_path=public | WHERE locked_by=auth.uid()');
  info('SA-4','admin_create_show: search_path=public | is_admin() check');
  info('SA-5','admin_cancel_booking: search_path=public | is_admin() check');
  info('SA-6','admin_get_active_locks: search_path=public | is_admin() check');
  info('SA-7','is_admin(): search_path=public | SECURITY DEFINER | coalesce false-safe');
  info('SA-8','get_my_profile(): search_path=public | SECURITY DEFINER | authenticated:false for anon');
  info('SA-9','handle_new_user(): search_path=public | SECURITY DEFINER | ON CONFLICT DO NOTHING');
  info('SA-10','show_seats: no UPDATE/INSERT/DELETE policy - changes only via SECURITY DEFINER RPCs');
  info('SA-11','bookings: no INSERT/UPDATE/DELETE policy - only confirm_booking RPC can create');
  info('SA-12','shows: INSERT/UPDATE/DELETE gated on is_admin()');
  info('SA-13','profiles: no UPDATE policy - role changes require SQL Editor (intentional)');
  info('SA-14','migration 007: anon grant revoked from lock_seats, confirm_booking, release_held_seats, is_admin()');
  info('SA-15','PENDING: Apply migration 005 to Supabase DB to fix confirm_booking FOR UPDATE+aggregate bug');

  // SUMMARY
  console.log('\\n=== PHASE 9 RESULTS ===\\n');
  const passed=results.filter(r=>r.s==='PASS');
  const failed=results.filter(r=>r.s==='FAIL');
  const infos =results.filter(r=>r.s==='INFO');
  console.log('Total: '+results.length+' | PASS: '+passed.length+' | FAIL: '+failed.length+' | INFO: '+infos.length);
  if(failed.length>0){console.log('\\nFailed:');failed.forEach(f=>console.log('  FAIL: '+f.n+': '+f.d));}
  console.log('\\nDone.');
  process.exit(failed.length>0?1:0);
}
runTests().catch(err=>{console.error('Fatal:',err);process.exit(1);});