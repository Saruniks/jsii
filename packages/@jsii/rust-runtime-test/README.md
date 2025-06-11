# Jsii Rust Runtime Tests

This package contains compliance tests for the Rust jsii runtime implementation, following the [AWS jsii Language Implementation Guide](https://aws.github.io/jsii/user-guides/language-support/).

## Overview

The tests in this package verify that the Rust jsii runtime correctly implements the jsii protocol and provides consistent behavior with other language runtimes (Java, Go, Python, .NET).

## Structure

```
packages/@jsii/rust-runtime-test/
├── project/                    # Rust test project
│   ├── src/
│   │   ├── lib.rs             # Test utilities and re-exports
│   │   └── compliance_tests.rs # Standard compliance tests
│   └── Cargo.toml             # Dependencies and configuration
├── build-tools/
│   └── gen-calc.js            # Generates jsii-calc Rust bindings
└── package.json               # NPM package configuration
```

## Development Phases

### Phase 1: Basic Infrastructure ✅ 
- [x] Create runtime test package structure
- [x] Set up basic jsii runtime library 
- [x] Implement 5 fundamental compliance tests (stubs)
- [x] Establish testing framework

### Phase 2: Core Runtime (In Progress)
- [ ] Implement actual jsii-runtime process communication
- [ ] Handle basic jsii protocol messages
- [ ] Get first 5 compliance tests passing
- [ ] Generate jsii-calc Rust bindings

### Phase 3: Expand Coverage  
- [ ] Implement collections (arrays, maps)
- [ ] Add class and interface support
- [ ] Handle error scenarios
- [ ] Pass 20+ core compliance tests

### Phase 4: Full Compliance
- [ ] Implement async operations
- [ ] Add property overrides
- [ ] Handle union types
- [ ] Pass 80%+ of Standard Compliance Suite

## Fundamental Compliance Tests

The 5 basic tests that must pass first:

1. **`test_jsii_agent`** - Verify jsii runtime starts and handshake works
2. **`test_primitive_types`** - Handle basic types (bool, string, number)  
3. **`test_call_methods`** - Invoke methods on jsii objects
4. **`test_statics`** - Call static methods and access static properties
5. **`test_get_set_primitive_properties`** - Get/set object properties

## Running Tests

```bash
# Run basic compliance tests
cd project && cargo test

# Generate jsii-calc bindings (when runtime is ready)
yarn build

# Run with generated bindings
cd project && cargo test --features jsii_calc
```

## Current Status

- ✅ **Code Generation**: Rust target generates valid, compilable code
- 🔄 **Runtime Stubs**: Basic protocol structures implemented
- ⏳ **Protocol Communication**: Need to implement actual jsii-runtime process communication
- ⏳ **Type Conversion**: Need Rust ↔ jsii JSON type mapping
- ⏳ **Object Lifecycle**: Need proper object reference management

## Next Steps

1. **Implement actual jsii communication** (reuse existing Rust CDK code)
2. **Get `test_jsii_agent` passing** (verify handshake works)
3. **Implement basic type conversion** (string, number, bool)
4. **Get `test_primitive_types` passing**
5. **Add object creation and method calls**

## Related Documentation

- [AWS jsii Language Implementation Guide](https://aws.github.io/jsii/user-guides/language-support/)
- [jsii Standard Compliance Suite](https://github.com/aws/jsii/blob/main/gh-pages/content/specification/4-standard-compliance-suite.md)
- [Go Runtime Tests](../go-runtime-test/) (reference implementation)
- [Python Runtime Tests](../python-runtime/tests/) (reference implementation) 