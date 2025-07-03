use chrono::{TimeZone, Utc};
use jsii_calc::AllTypes;

#[test]
fn test_get_bool_property() {
    // TODO: Do we use new, or {} (or <Type> init)?
    let all_types = AllTypes::new();
    let res = all_types.get_boolean_property();
    assert_eq!(res, false);
}

#[test]
fn test_set_bool_property() {
    let all_types = AllTypes::new();
    all_types.set_boolean_property(true);
    let res = all_types.get_boolean_property();
    assert_eq!(res, true);
}

#[test]
fn test_get_string_property() {
    let all_types = AllTypes::new();
    let res = all_types.get_string_property();
    assert_eq!(res, "first value".to_string());
}

#[test]
fn test_set_string_property() {
    let all_types = AllTypes::new();
    all_types.set_string_property("new value".to_string());
    let res = all_types.get_string_property();
    assert_eq!(res, "new value".to_string());
}

// TODO: Test not a string

#[test]
fn test_get_number_property() {
    let all_types = AllTypes::new();
    let res = all_types.get_number_property();
    assert_eq!(res, 0.0);
}

#[test]
fn test_set_number_property() {
    let all_types = AllTypes::new();
    all_types.set_number_property(100.0);
    let res = all_types.get_number_property();
    assert_eq!(res, 100.0);
}

// TODO: Test not a number

// #[test]
// fn test_get_date_property() {
//     let all_types = AllTypes::new();
//     // This will return current date in UTC
//     // TODO: When we'll return Result then check if is_ok()
//     let _res = all_types.get_date_property();
// }

// #[test]
// fn test_set_date_property() {
//     let all_types = AllTypes::new();
//     let date = Utc.with_ymd_and_hms(2021, 1, 1, 0, 0, 0).unwrap();

//     all_types.set_date_property(date);

//     let res = all_types.get_date_property();

//     assert_eq!(res, date);
// }
