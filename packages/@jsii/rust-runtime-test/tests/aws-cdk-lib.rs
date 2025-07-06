use aws_cdk_lib::{self, Stack};
use jsii_calc::interface_in_namespace_includes_classes::Hello;

struct HelloCdkStackProps {
    some_property: String,
}

impl aws_cdk_lib::StackProps for HelloCdkStackProps {
    // fn new(
    //     scope: Option<&aws_cdk_lib::constructs::Construct>,
    //     id: Option<&str>,
    //     props: Option<&aws_cdk_lib::StackProps>,
    // ) -> Self {
    //     let args = vec![
    //         serde_json::to_value(scope).expect("Failed to serialize scope"),
    //         serde_json::to_value(id).expect("Failed to serialize id"),
    //         serde_json::to_value(props).expect("Failed to serialize props"),
    //     ];
    //     let jsii_res =
    //         jsii_rust_runtime::JsiiRuntime::create_object("aws-cdk-lib.StackProps", Some(&args))
    //             .expect("JsiiRuntime::create_object panic");
    //     Self {
    //         jsii_object_ref: jsii_res,
    //     }
    // }
}

struct HelloCdkStack {
    jsii_object_ref: String,
}

impl Stack for HelloCdkStack {
    fn new(
        scope: Option<&aws_cdk_lib::constructs::Construct>,
        id: Option<&str>,
        props: Option<&aws_cdk_lib::StackProps>,
    ) -> Self {
        let args = vec![
            serde_json::to_value(scope).expect("Failed to serialize scope"),
            serde_json::to_value(id).expect("Failed to serialize id"),
            serde_json::to_value(props).expect("Failed to serialize props"),
        ];
        let jsii_res =
            jsii_rust_runtime::JsiiRuntime::create_object("aws-cdk-lib.Stack", Some(&args))
                .expect("JsiiRuntime::create_object panic");
        Self {
            jsii_object_ref: jsii_res,
        }
    }
}

#[test]
// #[serial]
fn test_aws_cdk_lib() {
    let app = aws_cdk_lib::App::new(None);
    // let stack = aws_cdk_lib::Stack::new(Some(&app), Some("TestStack"), Some(None));

    assert!(false, "This testis a placeholder for testing constructs");
}
