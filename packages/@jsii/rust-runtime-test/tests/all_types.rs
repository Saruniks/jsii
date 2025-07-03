use jsii_calc::AllTypes;

#[test]
fn test_bool() {
    // TODO: Do we use new, or {} (or <Type> init)?
    let all_types = AllTypes::new();
    let res = all_types.get_boolean_property();
    assert_eq!(res, false);
}
