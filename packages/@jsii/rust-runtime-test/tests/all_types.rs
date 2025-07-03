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

#[test]
fn test_get_date_property() {
    let all_types = AllTypes::new();
    // This will return current date in UTC
    // TODO: When we'll return Result then check if is_ok()
    let _res = all_types.get_date_property();
}

#[test]
fn test_set_date_property() {
    let all_types = AllTypes::new();
    let date = Utc.with_ymd_and_hms(2021, 1, 1, 0, 0, 0).unwrap();

    all_types.set_date_property(date);

    let res = all_types.get_date_property();

    assert_eq!(res, date);
}

// TODO: Test for if (Object.prototype.toString.call(value) !== '[object Date]')

#[test]
fn test_get_json_property() {
    let all_types = AllTypes::new();
    // Get empty object
    let res = all_types.get_json_property();
    assert_eq!(res, serde_json::json!({}));
} // Set new object

#[test]
fn test_set_json_property() {
    let all_types = AllTypes::new();

    // Get empty object
    let res = all_types.get_json_property();
    assert_eq!(res, serde_json::json!({}));

    // Set new object
    let new_value = serde_json::json!({"key": "value"});
    all_types.set_json_property(new_value.clone());

    // Get again and check if is the same
    let res = all_types.get_json_property();
    assert_eq!(res, new_value);

    let another_new_value = serde_json::json!({"another_key": "another_value"});
    all_types.set_json_property(another_new_value.clone());

    // And again and check if is the same
    let res = all_types.get_json_property();
    assert_eq!(res, another_new_value);
}
