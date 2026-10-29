use areal_plugins::Store;
use std::fs;

#[test]
fn empty_home_snapshot_and_doctor_do_not_create_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("absent/plugins");
    let snapshot = Store::read_snapshot(root.clone(), None, None, None).unwrap();
    assert_eq!(snapshot.revision, 0);
    assert!(snapshot.list.data.is_empty());
    assert!(!snapshot.runtime_observed);
    assert!(!snapshot.doctor().runtime_observed);
    assert!(!root.parent().unwrap().exists());
}

#[test]
fn malformed_state_is_reported_without_rewriting_it() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("state.json"), b"broken").unwrap();
    assert!(Store::read_snapshot(temp.path().into(), None, None, None).is_err());
    assert_eq!(fs::read(temp.path().join("state.json")).unwrap(), b"broken");
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}
