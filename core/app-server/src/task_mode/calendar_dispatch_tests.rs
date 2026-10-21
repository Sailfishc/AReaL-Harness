use super::*;
use areal_engine::model::{Message, Model, ModelEvent, ModelStream, RequestPurpose, ToolCall};
use std::sync::{Mutex as StdMutex, atomic::{AtomicBool, Ordering}};

#[derive(Default)]
struct Observed { prepares: StdMutex<Vec<Value>>, goals: StdMutex<std::collections::BTreeSet<String>>, hold: AtomicBool, release: tokio::sync::Notify }
#[async_trait::async_trait]
impl Model for Observed {
    fn name(&self)->&str { "calendar-observer" }
    async fn stream(&self,m:Vec<Message>)->anyhow::Result<ModelStream>{ self.chat_limited(m,vec![],RequestPurpose::Solve,None).await }
    async fn chat_limited(&self,m:Vec<Message>,_:Vec<Value>,_:RequestPurpose,_:Option<u64>)->anyhow::Result<ModelStream>{
        let view:Value=m.iter().rev().find_map(|m|m.text_content().split("Current authoritative goal: ").nth(1).and_then(|t|serde_json::from_str(t).ok())).unwrap();
        self.goals.lock().unwrap().insert(view["goal"]["id"].as_str().unwrap().into());
        let event=if view["goal"]["report"]["status"]=="complete" { ModelEvent::TextDelta("calendar observed".into()) } else { ModelEvent::ToolCall(ToolCall{id:uuid::Uuid::new_v4().to_string(),name:"goal_update".into(),arguments:json!({"expectedRevision":view["revision"],"status":"complete","summary":"calendar completed","evidence":["independent model observation"],"remaining":[]}).to_string()}) };
        Ok(Box::pin(futures_util::stream::iter(vec![Ok(event)])))
    }
}
#[async_trait::async_trait]
impl areal_engine::tools::DynamicToolHost for Observed {
    fn id(&self)->&str { "calendar-host" }
    fn identity(&self)->&str { "trusted-embedded-host" }
    fn is_closed(&self)->bool { false }
    async fn prepare_schedule(&self,p:Value,_:CancellationToken)->anyhow::Result<Value>{
        self.prepares.lock().unwrap().push(p);
        if self.hold.load(Ordering::SeqCst){self.release.notified().await;}
        Ok(json!({}))
    }
    async fn call(&self,_:Value,_:CancellationToken)->anyhow::Result<areal_protocol::DynamicToolResponse>{anyhow::bail!("unexpected call")}
}
fn open_calendar(path:&std::path::Path, model:Arc<Observed>, at:i64)->Arc<Engine>{
    let e=Engine::open(path,model,areal_engine::Limits::default()).unwrap();
    e.set_schedule_time(at).unwrap(); e
}
async fn rpc(e:&Arc<Engine>,method:&str,p:Value)->Value {dispatch(e,&auth::Principal::embedded(),method,p).await.unwrap()}
async fn wait_calendar(e:&Arc<Engine>,id:&Value,n:usize,decision:Option<&str>)->Value{
    tokio::time::timeout(Duration::from_secs(15),async{loop{
        let t=rpc(e,"areal/task/read",json!({"taskId":id})).await;
        let runs=t["runs"].as_array().unwrap();
        if runs.len()==n && (n==0 || runs.last().unwrap()["status"]=="completed") && decision.is_none_or(|d|t["lastTriggerDecision"]["outcome"]["kind"]==d){return t;}
        tokio::time::sleep(Duration::from_millis(10)).await;
    }}).await.unwrap()
}
fn plan(rule:Value,misfire:Value)->Value {json!({"version":1,"rule":rule,"misfire":misfire,"overlap":"skip"})}
async fn create_calendar(e:&Arc<Engine>,name:&str,schedule:Value)->Value{
    let thread=e.create(e.default_cwd()).await.unwrap();
    rpc(e,"areal/task/create",json!({"requestId":name,"mode":"scheduled","objective":name,"threadId":thread.id,"scheduleV2":schedule})).await
}
#[tokio::test]
async fn calendar_preview_matches_five_durable_runs_across_restarts(){
    let literals:Value=serde_json::from_str(include_str!("calendar-literals.json")).unwrap();
    for (name,rule) in [
        ("shanghai-weekdays",json!({"kind":"calendar","frequency":"weekly","interval":1,"timeZone":"Asia/Shanghai","localTime":"09:00","anchorDate":"2026-10-23","weekdays":[1,2,3,4,5]})),
        ("new-york-gap",json!({"kind":"calendar","frequency":"daily","interval":1,"timeZone":"America/New_York","localTime":"02:30","anchorDate":"2026-03-07"})),
        ("new-york-fold",json!({"kind":"calendar","frequency":"daily","interval":1,"timeZone":"America/New_York","localTime":"01:30","anchorDate":"2026-10-31"})),
        ("shanghai-month31",json!({"kind":"calendar","frequency":"monthly","interval":1,"timeZone":"Asia/Shanghai","localTime":"09:00","anchorDate":"2026-01-31","monthDays":[31]})),
        ("shanghai-last-leap",json!({"kind":"calendar","frequency":"monthly","interval":1,"timeZone":"Asia/Shanghai","localTime":"09:00","anchorDate":"2028-01-31","monthDays":["last"]})),
    ] {
        let dir=tempfile::tempdir().unwrap();let seen=Arc::new(Observed::default());
        let expected:Vec<i64>=literals["cases"][name].as_array().unwrap().iter().map(|v|v["at"].as_i64().unwrap()).collect();
        let schedule=plan(rule,json!({"kind":"skip","maxLatenessSeconds":300}));
        let mut e=open_calendar(dir.path(),seen.clone(),expected[0]-1);
        let preview=rpc(&e,"areal/task/schedule/preview",json!({"schedule":schedule,"count":5})).await;
        assert_eq!(preview["occurrences"].as_array().unwrap().iter().map(|v|v["at"].as_i64().unwrap()).collect::<Vec<_>>(),expected);
        let task=create_calendar(&e,name,schedule.clone()).await;
        for (i,at) in expected.iter().enumerate(){
            e.register_schedule_host(seen.clone()).await.unwrap();
            e.set_schedule_time(*at).unwrap();
            let t=wait_calendar(&e,&task["id"],i+1,None).await;
            assert_eq!(t["runs"][i]["scheduledAt"],*at,"{name}");
            assert_eq!(t["runs"][i]["acceptedSchedule"]["scheduleV2"],schedule);
            assert_eq!(seen.goals.lock().unwrap().len(),i+1,"independent model goal count");
            assert_eq!(seen.prepares.lock().unwrap().len(),i+1,"independent Host preparation count");
            if name=="new-york-fold" && i==1 {
                e.set_schedule_time(1793514600).unwrap();
                tokio::time::sleep(Duration::from_millis(1100)).await;
                let fold=rpc(&e,"areal/task/read",json!({"taskId":task["id"]})).await;
                assert_eq!(fold["runs"].as_array().unwrap().len(),2,"later fold never admits");
                assert_eq!(seen.prepares.lock().unwrap().len(),2);
            }
            e.shutdown().await; drop(e);
            e=open_calendar(dir.path(),seen.clone(),*at);
        }
        let final_task=rpc(&e,"areal/task/read",json!({"taskId":task["id"]})).await;
        assert_eq!(final_task["runs"].as_array().unwrap().iter().map(|r|r["scheduledAt"].as_i64().unwrap()).collect::<Vec<_>>(),expected);
        e.shutdown().await;
    }
}
#[tokio::test]
async fn calendar_skip_window_and_coalesce_preserve_earliest_pending(){
    for late in [0,1,300,301] {
        let dir=tempfile::tempdir().unwrap();let seen=Arc::new(Observed::default());let e=open_calendar(dir.path(),seen.clone(),2000000000);
        let task=create_calendar(&e,"window",plan(json!({"kind":"once","at":2000000000}),json!({"kind":"skip","maxLatenessSeconds":300}))).await;
        e.set_schedule_time(2000000000+late).unwrap();
        assert_eq!(rpc(&e,"areal/task/read",json!({"taskId":task["id"]})).await["nextRunAt"],2000000000);
        e.register_schedule_host(seen.clone()).await.unwrap();
        let t=wait_calendar(&e,&task["id"],if late<=300{1}else{0},Some(if late<=300{"admitted"}else{"missedWindow"})).await;
        assert_eq!(t["nextRunAt"],Value::Null);
        assert_eq!(t["lastTriggerDecision"]["originalScheduledAt"],2000000000);
        assert_eq!(seen.prepares.lock().unwrap().len(),if late<=300{1}else{0});
        e.shutdown().await;
    }
    let dir=tempfile::tempdir().unwrap();let seen=Arc::new(Observed::default());let e=open_calendar(dir.path(),seen.clone(),2000000000);
    let task=create_calendar(&e,"coalesce",plan(json!({"kind":"interval","anchorAt":2000000000,"intervalSeconds":60}),json!({"kind":"coalesce"}))).await;
    e.set_schedule_time(2000000301).unwrap();e.register_schedule_host(seen.clone()).await.unwrap();
    let t=wait_calendar(&e,&task["id"],1,Some("admitted")).await;
    assert_eq!(t["runs"][0]["scheduledAt"],2000000000);assert_eq!(t["nextRunAt"],2000000360);assert_eq!(t["lastTriggerDecision"]["dueCount"],6);
    e.shutdown().await;
}
#[tokio::test]
async fn calendar_original_civil_intent_receipt_and_accepted_rule_survive_edit(){
    let dir=tempfile::tempdir().unwrap();let seen=Arc::new(Observed::default());seen.hold.store(true,Ordering::SeqCst);
    let e=open_calendar(dir.path(),seen.clone(),1792717199);
    let thread=e.create(e.default_cwd()).await.unwrap();
    let request=json!({"requestId":"civil-replay","mode":"scheduled","objective":"accepted objective","threadId":thread.id,"scheduleV2":plan(json!({"kind":"onceLocal","timeZone":"Asia/Shanghai","localTime":"09:00","date":{"kind":"next"}}),json!({"kind":"coalesce"}))});
    let task=rpc(&e,"areal/task/create",request.clone()).await;
    assert_eq!(task["nextRunAt"],1792717200);
    e.register_schedule_host(seen.clone()).await.unwrap();e.set_schedule_time(1792717200).unwrap();
    tokio::time::timeout(Duration::from_secs(10),async{while seen.prepares.lock().unwrap().is_empty(){tokio::time::sleep(Duration::from_millis(10)).await;}}).await.unwrap();
    let accepted=rpc(&e,"areal/task/read",json!({"taskId":task["id"]})).await;
    let edit=rpc(&e,"areal/task/update",json!({"requestId":"edit-accepted","taskId":task["id"],"expectedRevision":accepted["revision"],"objective":"future objective","scheduleV2":plan(json!({"kind":"once","at":1792976400}),json!({"kind":"skip","maxLatenessSeconds":300}))})).await;
    assert_eq!(edit["runs"],accepted["runs"]);
    e.set_schedule_time(1792803600).unwrap();
    assert_eq!(rpc(&e,"areal/task/create",request.clone()).await,task,"receipt binds original civil intent");
    seen.hold.store(false,Ordering::SeqCst);seen.release.notify_one();
    let done=wait_calendar(&e,&task["id"],1,None).await;
    assert_eq!(done["runs"][0]["objective"],"accepted objective");assert_eq!(done["runs"][0]["scheduledAt"],1792717200);
    e.shutdown().await;drop(e);
    let e=open_calendar(dir.path(),seen,1792803600);
    assert_eq!(rpc(&e,"areal/task/create",request).await,task);
    e.shutdown().await;
}
