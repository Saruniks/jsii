use jsii_calc::JSObjectLiteralToNative;
use jsii_calc::JSObjectLiteralToNativeClass;
use serial_test::serial;

#[test]
#[serial]
fn test_object_literal_to_native_class() {
    // Create the class that returns an object literal
    let test_class = JSObjectLiteralToNative::new();

    // Call the method that returns an object literal that should be converted to a native class
    let result = test_class.return_literal();

    // Verify the properties have been correctly set
    assert_eq!(result.get_prop_A(), "Hello".to_string());
    assert_eq!(result.get_prop_B(), 102.0);

    // Create a new instance directly for comparison
    let direct_instance = JSObjectLiteralToNativeClass::new();

    // Initial values from the class should be different
    assert_eq!(direct_instance.get_prop_A(), "A".to_string());
    assert_eq!(direct_instance.get_prop_B(), 0.0);

    // Set the properties to match our returned instance
    direct_instance.set_prop_A("Hello".to_string());
    direct_instance.set_prop_B(102.0);

    // Now the direct instance should have the same properties as the one returned from returnLiteral
    assert_eq!(direct_instance.get_prop_A(), result.get_prop_A());
    assert_eq!(direct_instance.get_prop_B(), result.get_prop_B());
}
