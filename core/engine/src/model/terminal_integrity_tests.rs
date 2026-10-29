use super::*;

fn function(status: Option<Value>, arguments: &str) -> Value {
    let mut item = json!({"type":"function_call","id":"item-terminal",
        "call_id":"call-terminal","name":"fs_write","arguments":arguments});
    if let Some(status) = status {
        item["status"] = status;
    }
    item
}

fn decode(
    prefix: Vec<Value>,
    output: Vec<Value>,
    with_usage: bool,
    max_calls: usize,
    chunk: usize,
) -> (Vec<ModelEvent>, Result<()>) {
    let mut response = json!({"status":"completed","output":output});
    if with_usage {
        response["usage"] = json!({"input_tokens":19,"output_tokens":7});
    }
    let wire = prefix
        .into_iter()
        .chain([json!({"type":"response.completed","response":response})])
        .map(|event| format!("data: {event}\n\n"))
        .collect::<String>();
    let mut decoder = Decoder::Responses(ResponsesDecoder::new(ToolCallLimits {
        max_calls,
        ..ToolCallLimits::default()
    }));
    let mut events = Vec::new();
    for bytes in wire.as_bytes().chunks(chunk.min(wire.len())) {
        match decoder.feed(bytes) {
            Ok(part) => events.extend(part),
            Err(error) => return (events, Err(error)),
        }
    }
    match decoder.finish() {
        Ok(part) => {
            events.extend(part);
            (events, Ok(()))
        }
        Err(error) => (events, Err(error)),
    }
}

#[test]
fn terminal_validation_errors_keep_only_observed_final_usage() {
    for chunk in [1, 17, usize::MAX] {
        for with_usage in [false, true] {
            for case in 0..4 {
                let complete = function(Some(json!("completed")), "{}");
                let (prefix, output, max_calls) = match case {
                    0 => (vec![], vec![complete.clone()], 0),
                    1 => (
                        vec![json!({"type":"response.output_item.done","item":complete})],
                        vec![function(Some(json!("completed")), "{\"other\":true}")],
                        8,
                    ),
                    2 => (
                        vec![],
                        vec![json!({"type":"function_call","name":"fs_write","arguments":"{}"})],
                        8,
                    ),
                    _ => (
                        vec![json!({"type":"response.reasoning_summary_text.delta",
                            "item_id":"reasoning-terminal","summary_index":0,"delta":"original"})],
                        vec![json!({"type":"reasoning","id":"reasoning-terminal",
                            "summary":[{"type":"summary_text","text":"conflicting"}]})],
                        8,
                    ),
                };
                let (events, result) = decode(prefix, output, with_usage, max_calls, chunk);
                let error = result.unwrap_err();
                assert_eq!(
                    error.is::<FinalUsageError>(),
                    with_usage,
                    "case={case}, chunk={chunk}, error={error:#}"
                );
                assert_eq!(
                    events
                        .iter()
                        .filter(|e| matches!(e, ModelEvent::Usage(_)))
                        .count(),
                    usize::from(with_usage)
                );
                assert!(!events.iter().any(|e| matches!(e, ModelEvent::ToolCall(_))));
            }
        }
    }
}

#[test]
fn explicit_unfinished_function_items_never_become_calls() {
    for status in [
        json!("incomplete"),
        json!("in_progress"),
        json!("failed"),
        json!(false),
    ] {
        for with_usage in [false, true] {
            for chunk in [1, 17, usize::MAX] {
                let (events, result) = decode(
                    vec![],
                    vec![function(Some(status.clone()), "{}")],
                    with_usage,
                    8,
                    chunk,
                );
                let error = result.expect_err("An unfinished item cannot authorize a tool");
                assert_eq!(error.is::<FinalUsageError>(), with_usage);
                assert!(!events.iter().any(|e| matches!(e, ModelEvent::ToolCall(_))));
            }
        }
    }
}

#[test]
fn final_function_metadata_can_confirm_a_previously_unfinished_item() {
    let item = function(Some(json!("incomplete")), "{}");
    let (events, result) = decode(
        vec![json!({"type":"response.output_item.done","item":item})],
        vec![function(Some(json!("completed")), "{}")],
        true,
        8,
        1,
    );
    result.unwrap();
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, ModelEvent::ToolCall(_)))
            .count(),
        1
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, ModelEvent::ProviderContext(item)
        if item["type"] == "function_call" && item["status"] == "completed"))
    );
}

#[test]
fn final_unfinished_status_cannot_be_overridden_by_an_earlier_completed_item() {
    let item = function(Some(json!("completed")), "{}");
    let (events, result) = decode(
        vec![json!({"type":"response.output_item.done","item":item})],
        vec![function(Some(json!("incomplete")), "{}")],
        true,
        8,
        17,
    );
    assert!(result.unwrap_err().is::<FinalUsageError>());
    assert!(!events.iter().any(|e| matches!(e, ModelEvent::ToolCall(_))));
}

#[test]
fn legacy_function_items_with_no_status_remain_compatible() {
    for status in [None, Some(Value::Null), Some(json!("completed"))] {
        let (events, result) = decode(vec![], vec![function(status, "{}")], true, 8, 1);
        result.unwrap();
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, ModelEvent::ToolCall(_)))
                .count(),
            1
        );
    }
}
