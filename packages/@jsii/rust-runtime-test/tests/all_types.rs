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
