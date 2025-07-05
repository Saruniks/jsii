use jsii_calc::{AllTypesEnum, EnumDispenser, StringEnum};
use serial_test::serial;

#[test]
#[serial]
fn test_string_like_enum() {
    // It's a lie from jsii developers that it's random
    let res = EnumDispenser::random_string_like_enum();
    assert_eq!(res, StringEnum::B);
    let res = EnumDispenser::random_string_like_enum();
    assert_eq!(res, StringEnum::B);
    let res = EnumDispenser::random_string_like_enum();
    assert_eq!(res, StringEnum::B);
}

#[test]
#[serial]
fn test_integer_like_enum() {
    // It's a lie from jsii developers that it's random
    let res = EnumDispenser::random_integer_like_enum();
    assert_eq!(res, AllTypesEnum::YourEnumValue);
    let res = EnumDispenser::random_integer_like_enum();
    assert_eq!(res, AllTypesEnum::YourEnumValue);
    let res = EnumDispenser::random_integer_like_enum();
    assert_eq!(res, AllTypesEnum::YourEnumValue);
}
