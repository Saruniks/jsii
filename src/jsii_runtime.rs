//! JSII Runtime for Rust
//! 
//! This module provides the runtime interface for JSII interop.
//! All generated code calls these runtime functions to interact with the JavaScript side.

use serde_json::Value;
use std::collections::HashMap;

/// Represents a reference to a JSII object in the JavaScript runtime
#[derive(Debug, Clone)]
pub struct JsiiObjectRef {
    /// The unique identifier for this object in the JavaScript runtime
    pub object_id: String,
    /// The JSII type name
    pub type_name: String,
}

impl JsiiObjectRef {
    /// Create a new JSII object reference
    pub fn new(object_id: String, type_name: String) -> Self {
        Self { object_id, type_name }
    }
}

/// Stub JSII Runtime for development
/// In a real implementation, this would communicate with Node.js via JSON-RPC
pub struct JsiiRuntime;

impl JsiiRuntime {
    /// Get singleton instance of the runtime
    pub fn instance() -> &'static Self {
        static INSTANCE: JsiiRuntime = JsiiRuntime;
        &INSTANCE
    }

    /// Call a method on a JSII object
    pub fn call_method(
        &self,
        obj_ref: &JsiiObjectRef,
        method_name: &str,
        args: Vec<Value>
    ) -> Result<Value, String> {
        // TODO: Implement actual JSII call
        println!("JSII CALL: {}.{}({:?})", obj_ref.type_name, method_name, args);
        Ok(Value::Null)
    }

    /// Get a property from a JSII object
    pub fn get_property(
        &self,
        obj_ref: &JsiiObjectRef,
        property_name: &str
    ) -> Result<Value, String> {
        // TODO: Implement actual JSII property get
        println!("JSII GET: {}.{}", obj_ref.type_name, property_name);
        Ok(Value::Null)
    }

    /// Set a property on a JSII object
    pub fn set_property(
        &self,
        obj_ref: &JsiiObjectRef,
        property_name: &str,
        value: Value
    ) -> Result<(), String> {
        // TODO: Implement actual JSII property set
        println!("JSII SET: {}.{} = {:?}", obj_ref.type_name, property_name, value);
        Ok(())
    }

    /// Create a new JSII object
    pub fn create_object(
        &self,
        type_name: &str,
        args: Vec<Value>
    ) -> Result<JsiiObjectRef, String> {
        // TODO: Implement actual JSII object creation
        println!("JSII CREATE: {}({:?})", type_name, args);
        Ok(JsiiObjectRef::new(
            format!("obj_{}", rand::random::<u32>()),
            type_name.to_string()
        ))
    }
}

// External dependency type stubs - these come from other JSII packages
// In a real implementation, these would be imported from their respective crates

/// Stub for NumericValue from @scope/jsii-calc-lib
#[derive(Debug, Clone)]
pub struct NumericValue {
    pub value: f64,
}

impl Default for NumericValue {
    fn default() -> Self {
        Self { value: 0.0 }
    }
}

/// Stub for BaseProps from @scope/jsii-calc-lib  
#[derive(Debug, Clone)]
pub struct BaseProps {
    pub bar: String,
    pub foo: Vec<f64>,
}

impl Default for BaseProps {
    fn default() -> Self {
        Self {
            bar: String::new(),
            foo: Vec::new(),
        }
    }
}

/// Stub trait for IRandomNumberGenerator from @scope/jsii-calc-lib
pub trait IRandomNumberGenerator {
    fn next(&self) -> f64;
}

/// Stub trait for IBaseInterface from @scope/jsii-calc-base
pub trait IBaseInterface {
    fn success(&self) -> bool;
}

/// Stub for Reflector from @scope/jsii-calc-lib
#[derive(Debug, Clone)]
pub struct Reflector;

impl Default for Reflector {
    fn default() -> Self {
        Self
    }
}

/// Stub for ReflectableEntry from @scope/jsii-calc-lib
#[derive(Debug, Clone)]
pub struct ReflectableEntry {
    pub key: String,
    pub value: String,
}

impl Default for ReflectableEntry {
    fn default() -> Self {
        Self {
            key: String::new(),
            value: String::new(),
        }
    }
}

/// Stub trait for IReflectable from @scope/jsii-calc-lib
pub trait IReflectable {
    fn reflector(&self) -> Reflector;
    fn entries(&self) -> Vec<ReflectableEntry>;
}

/// Stub trait for IFriendly from @scope/jsii-calc-lib
pub trait IFriendly {
    fn hello(&self) -> String;
}

/// Stub for BaseFor2647 from @scope/jsii-calc-lib
pub trait BaseFor2647 {
    fn method2647(&self);
}

/// Helper trait for converting values to/from JSII
pub trait JsiiConvert {
    fn to_jsii(&self) -> Value;
    fn from_jsii(value: Value) -> Result<Self, String> where Self: Sized;
}

impl JsiiConvert for String {
    fn to_jsii(&self) -> Value {
        Value::String(self.clone())
    }
    
    fn from_jsii(value: Value) -> Result<Self, String> {
        match value {
            Value::String(s) => Ok(s),
            _ => Err("Expected string".to_string()),
        }
    }
}

impl JsiiConvert for f64 {
    fn to_jsii(&self) -> Value {
        Value::Number(serde_json::Number::from_f64(*self).unwrap())
    }
    
    fn from_jsii(value: Value) -> Result<Self, String> {
        match value {
            Value::Number(n) => Ok(n.as_f64().unwrap_or(0.0)),
            _ => Err("Expected number".to_string()),
        }
    }
}

impl JsiiConvert for bool {
    fn to_jsii(&self) -> Value {
        Value::Bool(*self)
    }
    
    fn from_jsii(value: Value) -> Result<Self, String> {
        match value {
            Value::Bool(b) => Ok(b),
            _ => Err("Expected boolean".to_string()),
        }
    }
} 