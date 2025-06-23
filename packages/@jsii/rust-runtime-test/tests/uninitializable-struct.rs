#[test]
fn test_uninitializable_struct_with_static_methods() {
    let t = trybuild::TestCases::new();
    t.compile_fail("trybuild/uninitializable-struct.rs");
    t.compile_fail("trybuild/uninitializable-struct-new.rs");
    t.pass("trybuild/static-struct-methods.rs");
}
