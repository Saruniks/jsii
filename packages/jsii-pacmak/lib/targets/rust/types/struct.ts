import { CodeMaker } from "codemaker";
import { ClassType } from "jsii-reflect"
import { RustType } from "../rust-type";
import { makeRustPropertyName, substituteReservedWords } from "../util";
import { emitMethod } from "./method";
import { compileJsiiForTest } from "jsii";

export class RustStruct extends RustType<ClassType> {
  public emit(code: CodeMaker) {
    if (!this.type.initializer) {
      code.line('#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]');
      code.openBlock(`pub struct ${this.type.name}`);
      code.line('// _private field is used to prevent instantiation of this struct');
      code.line(`_private: (),`);
      code.closeBlock();
    } else {
      code.line('#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]');
      code.openBlock(`pub struct ${this.type.name}`);
      // TODO: Should jsii_object be something else than String?
      code.line('pub jsii_object_ref: String,');
      code.closeBlock();
    }
    code.line();

    code.openBlock(`impl ${this.type.name}`);

    if (this.type.initializer) {
      // Get the initializer parameters
      const initParams = this.type.initializer.parameters;
      
      if (initParams.length === 0) {
        // No parameters, generate a simple constructor
        code.openBlock(`pub fn new() -> Self`);
        code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::create_object("${this.type.fqn}", Some(&[])).expect("JsiiRuntiem::create_object panic");`);
        code.line(`Self { jsii_object_ref: jsii_res }`);
        code.closeBlock();
      } else {
        // Generate constructor with parameters
        const paramsList = initParams.map(param => {
          const paramType = makeRustType(param.type, this.type.assembly.name);
          // Use 'param_' prefix for unnamed parameters or parameters named with underscore
          const paramName = param.name === '_' || !param.name ? `param_${initParams.indexOf(param)}` : makeRustPropertyName(param.name);
          return `${paramName}: ${paramType}`;
        }).join(', ');
        
        code.openBlock(`pub fn new(${paramsList}) -> Self`);
        
        // Generate code to serialize each parameter
        const argsArray = initParams.map(param => {
          // Use 'param_' prefix for unnamed parameters or parameters named with underscore
          const paramName = param.name === '_' || !param.name ? `param_${initParams.indexOf(param)}` : makeRustPropertyName(param.name);
          return `serde_json::to_value(&${paramName}).expect("Failed to serialize ${paramName}")`;
        }).join(', ');
        
        code.line(`let args = vec![${argsArray}];`);
        code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::create_object("${this.type.fqn}", Some(&args)).expect("JsiiRuntiem::create_object panic");`);
        code.line(`Self { jsii_object_ref: jsii_res }`);
        code.closeBlock();
      }
      code.line();
    }

    for (const method of this.type.ownMethods) {
      // TODO: Can we check if parentType of actual method is InterfaceType correctly?
      emitMethod(code, method, this.type.fqn, this.type.assembly.name, false);
    }

    console.log(`DEBUG: Processing class ${this.type.name}, found ${this.type.ownProperties.length} properties:`);
    this.type.ownProperties.forEach(prop => {
      console.log(`  - ${prop.name} (optional: ${prop.optional})`);
    });

    for (const property of this.type.ownProperties) {
        // if (property.name === 'booleanValue') {
          // code.line('fail compile');
        // }
        console.log(`DEBUG: Processing property ${property.name}, optional: ${property.optional}, type:`, property.type);

        code.openBlock(`pub fn get_${makeRustPropertyName(property.name)}(&self) -> ${makeRustTypeForProperty(property.type, this.type.assembly.name, property.optional)}`);

        // TODO: Handle different property types and static properties
        if (this.type.initializer) {
          // Check if this is a trait (interface) type
          const traitTypeProperty = isTraitType(property.type);
          
          if (traitTypeProperty) {
            // For trait types, just return a todo!()
            code.line(`todo!();`);
          } else {
            // Check if it's a primitive type first
            const isPrimitive = property.type.primitive;
            console.log(`DEBUG: Property ${property.name}, isPrimitive: ${isPrimitive}, type:`, property.type);
            
            // Check if it's an enum type
            const isEnum = property.type.type?.isEnumType && property.type.type.isEnumType();
            console.log(`DEBUG: Property ${property.name}, isEnum: ${isEnum}`);
            
            if (isEnum) {
              // For enum types, we need to extract the enum value from the $jsii.enum object
              code.line(`{`);
              code.line(`  let json_response: serde_json::Value = jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get failed");`);
              
              if (property.optional) {
                // For optional enum properties, handle null/undefined values
                code.line(`  // Handle optional enum: check if the value is null/undefined`);
                code.line(`  if json_response.is_null() {`);
                code.line(`    None`);
                code.line(`  } else if let Some(enum_value) = json_response.get("$jsii.enum").and_then(|v| v.as_str()) {`);
                code.line(`    Some(enum_value.to_string())`);
                code.line(`  } else {`);
                code.line(`    // If it's not in enum format, try to return as-is (for default values)`);
                code.line(`    json_response.as_str().map(|s| s.to_string())`);
                code.line(`  }`);
              } else {
                // For required enum properties, the value must be present
                code.line(`  // Extract enum value from {"$jsii.enum": "fqn/VALUE"} format`);
                code.line(`  if let Some(enum_value) = json_response.get("$jsii.enum").and_then(|v| v.as_str()) {`);
                code.line(`    enum_value.to_string()`);
                code.line(`  } else {`);
                code.line(`    // If it's not in enum format, try to return as-is (for default values)`);
                code.line(`    json_response.as_str().unwrap_or("").to_string()`);
                code.line(`  }`);
              }
              code.line(`}`);
            } else if (isPrimitive) {
              // For primitive types, use the generic getter
              const result = `jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get failed")`;
              if (property.optional) {
                code.line(`Some(${result})`);
              } else {
                code.line(result);
              }
            } else {
              // Check if this is a map type
              const collection = (property.type as any).collection || (property.type as any).spec?.collection;
              if (collection?.kind === 'map') {
                // Check if map elements are complex types (like classes)
                const isComplexElement = collection.elementtype?.fqn || 
                                      (collection.elementtype?.type && !collection.elementtype.primitive);
                
                if (isComplexElement) {
                  // For maps with complex objects, we need to process each entry
                  const elementType = makeRustType(collection.elementtype, this.type.assembly.name);
                  
                  // Check if the element type is an interface (trait) - if so, use the concrete implementation
                  const isElementInterface = (collection.elementtype.type && 
                                           collection.elementtype.type.isInterfaceType && 
                                           collection.elementtype.type.isInterfaceType()) ||
                                          (!collection.elementtype.type && collection.elementtype.fqn && (
                                            collection.elementtype.fqn.includes('Props') || 
                                            collection.elementtype.fqn.includes('Entry') ||
                                            collection.elementtype.fqn.endsWith('Obj') ||
                                            collection.elementtype.fqn.startsWith('I')
                                          ));
                  
                  const actualElementType = isElementInterface ? 
                    (elementType.endsWith('Impl') ? elementType : `${elementType}Impl`) : 
                    elementType;
                  code.line(`{`);
                  code.line(`  // Get the map as a JSON value first`);
                  code.line(`  let json_response: serde_json::Value = jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get failed");`);
                  code.line(`  // Expect a $jsii.map object`);
                  code.line(`  let map_obj = json_response.get("$jsii.map").expect("Expected $jsii.map");`);
                  code.line(`  let mut result = std::collections::HashMap::new();`);
                  code.line(`  // Process each entry in the map`);
                  code.line(`  if let serde_json::Value::Object(map) = map_obj {`);
                  code.line(`    for (key, value) in map.iter() {`);
                  code.line(`      // Get the object reference from the byref`);
                  code.line(`      let obj_ref = value.get("$jsii.byref")`);
                  code.line(`        .and_then(|v| v.as_str())`);
                  code.line(`        .expect("Failed to extract object reference from map value")`);
                  code.line(`        .to_string();`);
                  code.line(`      // Create a new instance using the object reference`);
                  code.line(`      let obj = ${actualElementType} { jsii_object_ref: obj_ref };`);
                  code.line(`      result.insert(key.clone(), obj);`);
                  code.line(`    }`);
                  code.line(`  }`);
                  code.line(`  result`);
                  code.line(`}`);
                } else {
                  // For maps with primitive values, use generic getter
                  const result = `jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get failed")`;
                  if (property.optional) {
                    code.line(`Some(${result})`);
                  } else {
                    code.line(result);
                  }
                }
              } else {
                // Check if the Rust type is a simple type that should use generic getter
                const rustType = makeRustType(property.type, this.type.assembly.name);
                const isSimpleType = rustType === 'String' || rustType === 'f64' || rustType === 'bool' || rustType === 'serde_json::Value';
                
                if (isSimpleType) {
                  // For simple types (including enum strings), use the generic getter
                  const result = `jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get failed")`;
                  if (property.optional) {
                    code.line(`Some(${result})`);
                  } else {
                    code.line(result);
                  }
                } else {
                  // Determine if this is a complex type that needs special handling
                  const isComplexType = property.type.fqn || 
                    (property.type.type && property.type.type.fqn);
                  console.log(`DEBUG: Property ${property.name}, isComplexType: ${isComplexType}, fqn: ${property.type.fqn}`);
                
                  if (isComplexType) {
                    // For complex types, extract the object reference and construct a new instance
                    const typeName = makeRustType(property.type, this.type.assembly.name);
                    
                    // Check if this is an interface type that needs concrete wrapper
                    const isInterface = (property.type.type && property.type.type.isInterfaceType && property.type.type.isInterfaceType()) ||
                                       (!property.type.type && property.type.fqn && (
                                         property.type.fqn.includes('Props') || 
                                         property.type.fqn.includes('Entry') ||
                                         property.type.fqn.startsWith('I')
                                       ));
                    
                    if (isInterface) {
                      // For interface types, return the concrete wrapper implementation
                      code.line(`let json_response = jsii_rust_runtime::JsiiRuntime::get_string(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get_string failed");`);
                      code.line(`let parsed_response: serde_json::Value = serde_json::from_str(&json_response).expect("Failed to parse JSON response");`);
                      code.line(`let object_ref = parsed_response.get("$jsii.byref")`);
                      code.line(`  .and_then(|v| v.as_str())`);
                      code.line(`  .expect("Failed to extract object reference from response")`);
                      code.line(`  .to_string();`);
                      const result = `${typeName}::from_jsii_object_ref(object_ref)`;
                      if (property.optional) {
                        code.line(`Some(${result})`);
                      } else {
                        code.line(result);
                      }
                    } else {
                      // For other complex types, use the existing logic
                      code.line(`let json_response = jsii_rust_runtime::JsiiRuntime::get_string(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get_string failed");`);
                      code.line(`let parsed_response: serde_json::Value = serde_json::from_str(&json_response).expect("Failed to parse JSON response");`);
                      code.line(`let object_ref = parsed_response.get("$jsii.byref")`);
                      code.line(`  .and_then(|v| v.as_str())`);
                      code.line(`  .expect("Failed to extract object reference from response")`);
                      code.line(`  .to_string();`);
                      const result = `${typeName} { jsii_object_ref: object_ref, }`;
                      if (property.optional) {
                        code.line(`Some(${result})`);
                      } else {
                        code.line(result);
                      }
                    }
                  } else {
                    // For other cases (like unknown types), fall back to generic getter
                    const result = `jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntime::get failed")`;
                    if (property.optional) {
                      code.line(`Some(${result})`);
                    } else {
                      code.line(result);
                    }
                  }
                }
              }
            }
          }
        } else {
          code.line(`todo!();`);
        }

        code.closeBlock();
        code.line();

        code.openBlock(`pub fn set_${makeRustPropertyName(property.name)}(&self, value: ${makeRustTypeForProperty(property.type, this.type.assembly.name, property.optional)})`);

        // Check if this is a trait (interface) type
        const traitTypePropertySetter = isTraitType(property.type);
        
        // Check if this is an enum type for the setter
        const isEnumSetter = property.type.type?.isEnumType && property.type.type.isEnumType();
        
        if (this.type.initializer && !traitTypePropertySetter) {
          if (isEnumSetter) {
            if (property.optional) {
              // For optional enum setters, handle Option<String>
              code.line(`let jsii_value = match value {`);
              code.line(`  Some(enum_val) => serde_json::json!({"$jsii.enum": enum_val}),`);
              code.line(`  None => serde_json::Value::Null,`);
              code.line(`};`);
              code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "${substituteReservedWords(property.name)}", &jsii_value).expect("JsiiRuntiem::invoke panic");`);
            } else {
              // For required enum setters, wrap the string value in the JSII enum format
              code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "${substituteReservedWords(property.name)}", &serde_json::json!({"$jsii.enum": value})).expect("JsiiRuntiem::invoke panic");`);
            }
          } else {
            if (property.optional) {
              // For optional non-enum properties, handle Option<T>
              code.line(`let jsii_value = match value {`);
              code.line(`  Some(val) => ${makeRustTypeConversion(property.type).replace('&value', '&val')},`);
              code.line(`  None => serde_json::Value::Null,`);
              code.line(`};`);
              code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "${substituteReservedWords(property.name)}", &jsii_value).expect("JsiiRuntiem::invoke panic");`);
            } else {
              // For required properties, use the direct conversion
              code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "${substituteReservedWords(property.name)}", &${makeRustTypeConversion(property.type)}).expect("JsiiRuntiem::invoke panic");`);
            }
          }
        } else {
          code.line(`todo!();`);
        }
        code.closeBlock();
        code.line();
    }
    code.closeBlock();
    code.line();
  }
}

// Convert Rust types to JSII serialization format
function makeRustTypeConversion(type: any): string {
  // Extract collection from either direct or TypeReference
  const collection = type.collection || type.spec?.collection;
  
  if (type.primitive === 'date') {
    return 'serde_json::json!({"$jsii.date": serde_json::to_value(value).unwrap()})';
  } else if (collection?.kind === 'map') {
    // For maps, we need to convert each value to the proper JSII format
    // Maps with complex objects need special handling
    
    // Check if the element type is a complex object (class/interface)
    const isComplexElement = collection.elementtype?.fqn || 
                          (collection.elementtype?.type && !collection.elementtype.primitive);
    
    if (isComplexElement) {
      // For maps with complex objects, we need to transform each value to have $jsii.byref
      return `{
        let mut transformed_map = serde_json::Map::new();
        for (key, val) in value.iter() {
          // Get the value as a JSON string first (this avoids private field issues)
          let val_json = serde_json::to_string(val).expect("Failed to serialize map value");
          // Parse it back to access the jsii_object_ref field
          let val_parsed: serde_json::Value = serde_json::from_str(&val_json).expect("Failed to parse value JSON");
          // Extract the jsii_object_ref field value
          let obj_ref = val_parsed.get("jsii_object_ref")
            .and_then(|v| v.as_str())
            .expect("Failed to get jsii_object_ref from map value")
            .to_string();
          // Create the proper JSII reference
          transformed_map.insert(
            key.clone(),
            serde_json::json!({"$jsii.byref": obj_ref})
          );
        }
        serde_json::json!({"$jsii.map": transformed_map})
      }`;
    } else {
      // For maps with primitive values, use the standard serialization
      return 'serde_json::json!({"$jsii.map": serde_json::to_value(&value).expect("Failed to serialize map")})';
    }
  } else if (collection?.kind === 'array') {
    // For arrays, check if elements are complex objects
    const isComplexElement = collection.elementtype?.fqn || 
                          (collection.elementtype?.type && !collection.elementtype.primitive);
    
    if (isComplexElement) {
      // For arrays with complex objects, transform each element
      return `{
        let mut transformed_array = Vec::new();
        for val in value.iter() {
          // Get the value as a JSON string first (this avoids private field issues)
          let val_json = serde_json::to_string(val).expect("Failed to serialize array value");
          // Parse it back to access the jsii_object_ref field
          let val_parsed: serde_json::Value = serde_json::from_str(&val_json).expect("Failed to parse value JSON");
          // Extract the jsii_object_ref field value
          let obj_ref = val_parsed.get("jsii_object_ref")
            .and_then(|v| v.as_str())
            .expect("Failed to get jsii_object_ref from array value")
            .to_string();
          // Create the proper JSII reference
          transformed_array.push(serde_json::json!({"$jsii.byref": obj_ref}));
        }
        // JSII runtime expects arrays directly, not wrapped in $jsii.array
        serde_json::Value::Array(transformed_array)
      }`;
    } else {
      // For arrays with primitive values
      // The JSII runtime expects arrays as a Value, but not wrapped in $jsii.array
      return 'serde_json::to_value(&value).expect("Failed to serialize array")';
    }
  } else if (type.primitive) {
    return 'serde_json::to_value(&value).expect("Failed to serialize value")';
  } else if (type.type?.isEnumType()) {
    return 'serde_json::json!({"$jsii.enum": serde_json::to_value(value).unwrap()})';
  } else if (type.spec?.union) {
    return 'serde_json::to_value(&value).expect("Failed to serialize union value")';
  } else {
    return `{
      // Get the value as a JSON string first (this avoids private field issues)
      let val_json = serde_json::to_string(&value).expect("Failed to serialize object value");
      // Parse it back to access the jsii_object_ref field
      let val_parsed: serde_json::Value = serde_json::from_str(&val_json).expect("Failed to parse value JSON");
      // Extract the jsii_object_ref field value
      let obj_ref = val_parsed.get("jsii_object_ref")
        .and_then(|v| v.as_str())
        .expect("Failed to get jsii_object_ref from object")
        .to_string();
      // Create the proper JSII reference
      serde_json::json!({"$jsii.byref": obj_ref})
    }`;
  }
}

function makeRustTypeForProperty(type: any, currentAssemblyName?: string, isOptional?: boolean): string {
  // For property returns, we need to wrap traits in Box<dyn>
  let baseType = makeRustType(type, currentAssemblyName);
  
  // Check if this is a trait (interface) type
  if (isTraitType(type)) {
    baseType = `Box<dyn ${baseType}>`;
  }
  
  // Wrap in Option<T> if the property is optional
  if (isOptional) {
    baseType = `Option<${baseType}>`;
  }
  
  return baseType;
}

function makeTraitType(type: any, currentAssemblyName?: string): string {
  // Helper function to get the trait name for use in Box<dyn Trait>
  if (type.fqn) {
    const fullPath = convertFqnToRustPath(type.fqn, currentAssemblyName);
    return fullPath;
  }
  
  // Fallback
  return 'dyn std::any::Any';
}

function convertFqnToRustPath(fqn: string, currentAssemblyName?: string): string {
  const parts = fqn.split('.');
  const typeName = parts.pop() || '';
  
  if (parts.length === 0) {
    // No assembly/module info, just a type name
    return typeName;
  }
  
  // First part is the assembly
  const assemblyName = parts[0];
  
  // Map assembly name to crate name
  const crateName = mapAssemblyToCrateName(assemblyName, currentAssemblyName);
  
  if (assemblyName === currentAssemblyName) {
    // Same assembly - check if there are submodules
    const submoduleParts = parts.slice(1);
    
    if (submoduleParts.length > 0) {
      // Convert submodule names to snake_case for Rust modules
      // For paths like "jsii-calc.PythonSelf.StructWithSelf" -> "crate::python_self::StructWithSelf"
      // For paths like "jsii-calc.submodule.MyClass" -> "crate::submodule::MyClass"
      
      const rustSubmodules = submoduleParts.map(part => {
        // Convert PascalCase to snake_case for module names
        return part.replace(/([A-Z])/g, (match, letter, index) => {
          return index === 0 ? letter.toLowerCase() : '_' + letter.toLowerCase();
        });
      });
      
      return `${crateName}::${rustSubmodules.join('::')}::${typeName}`;
    } else {
      // Direct type in current assembly
      return `${crateName}::${typeName}`;
    }
  } else {
    // External assembly
    const submodules = parts.slice(1);
    
    // Build the full path: crate_name::submodule1::submodule2::TypeName
    let path = crateName;
    if (submodules.length > 0) {
      path += '::' + submodules.join('::');
    }
    path += '::' + typeName;
    
    return path;
  }
}

function mapAssemblyToCrateName(assemblyName: string, currentAssemblyName?: string): string {
  // If no assembly name, use current crate
  if (!assemblyName) {
    return 'crate';
  }
  
  // If same assembly as current, use crate
  if (assemblyName === currentAssemblyName) {
    return 'crate';
  }
  
  // Map common assembly names to crate names
  // Convert @scope/name to scope_name, and jsii-calc to jsii_calc
  return assemblyName
    .replace(/^@/, '') // Remove @ prefix
    .replace(/\//g, '_') // Replace / with _
    .replace(/-/g, '_'); // Replace - with _
}

function makeRustType(type: any, currentAssemblyName?: string): string {
  // Debug logging to help troubleshoot type detection
  console.log("Type to convert:", 
    type.primitive || 
    (type.collection ? `collection:${type.collection.kind}` : 
     (type.spec?.collection ? `collection:${type.spec.collection.kind}` : "complex type")));
  
  // Check for primitive types first
  if (type.primitive) {
    if (type.primitive === 'string') return 'String';
    if (type.primitive === 'number') return 'f64';
    if (type.primitive === 'boolean') return 'bool';
    if (type.primitive === 'date') return 'chrono::DateTime<chrono::Utc>';
    if (type.primitive === 'json') return 'serde_json::Value';
    
    // Default for other primitives
    console.log(`Unhandled primitive type: ${type.primitive}`);
    return 'serde_json::Value'; 
  }
  
  // Check for collection types - both direct and in TypeReference
  const collection = type.collection || type.spec?.collection;
  if (collection) {
    console.log("Found collection type with kind:", collection.kind);
    
    if (collection.kind === 'map') {
      // Make sure elementtype exists and handle it safely
      if (!collection.elementtype) {
        console.log("Map has no elementtype, defaulting to string");
        return 'std::collections::HashMap<String, String>';
      }
      
      // For interfaces/traits in collections, we need to use the concrete wrapper type
      // to allow for serialization/deserialization
      if (collection.elementtype.fqn) {
        // Check if the element type might be an interface/trait
        const isElementInterface = (collection.elementtype.type && 
                                 collection.elementtype.type.isInterfaceType && 
                                 collection.elementtype.type.isInterfaceType()) ||
                                (!collection.elementtype.type && (
                                  collection.elementtype.fqn.includes('Props') || 
                                  collection.elementtype.fqn.includes('Entry') ||
                                  collection.elementtype.fqn.endsWith('Obj') ||
                                  collection.elementtype.fqn.startsWith('I')
                                ));
        
        if (isElementInterface) {
          // For interface types in collections, use the concrete wrapper implementation
          const concreteType = makeConcreteWrapperType(collection.elementtype, currentAssemblyName);
          console.log(`DEBUG: Using concrete wrapper for interface in map: ${collection.elementtype.fqn} -> ${concreteType}`);
          return `std::collections::HashMap<String, ${concreteType}>`;
        }
      }
      
      // For non-interface types, use the regular type
      const valueType = makeRustType(collection.elementtype, currentAssemblyName);
      return `std::collections::HashMap<String, ${valueType}>`;
    }
    
    if (collection.kind === 'array') {
      // Make sure elementtype exists and handle it safely
      if (!collection.elementtype) {
        console.log("Array has no elementtype, defaulting to string");
        return 'Vec<String>';
      }
      
      // For interfaces/traits in collections, we need to use the concrete wrapper type
      // to allow for serialization/deserialization
      if (collection.elementtype.fqn) {
        // Check if the element type might be an interface/trait
        const isElementInterface = (collection.elementtype.type && 
                                 collection.elementtype.type.isInterfaceType && 
                                 collection.elementtype.type.isInterfaceType()) ||
                                (!collection.elementtype.type && (
                                  collection.elementtype.fqn.includes('Props') || 
                                  collection.elementtype.fqn.includes('Entry') ||
                                  collection.elementtype.fqn.endsWith('Obj') ||
                                  collection.elementtype.fqn.startsWith('I')
                                ));
        
        if (isElementInterface) {
          // For interface types in collections, use the concrete wrapper implementation
          const concreteType = makeConcreteWrapperType(collection.elementtype, currentAssemblyName);
          console.log(`DEBUG: Using concrete wrapper for interface in array: ${collection.elementtype.fqn} -> ${concreteType}`);
          return `Vec<${concreteType}>`;
        }
      }
      
      // For non-interface types, use the regular type
      const elementType = makeRustType(collection.elementtype, currentAssemblyName);
      return `Vec<${elementType}>`;
    }
    
    console.log(`Unhandled collection kind: ${collection.kind}`);
    return '()'; // Default for unknown collections
  }
  
  // Check for unions (seen in logs)
  if (type.spec?.union) {
    console.log("Found union type");
    return 'serde_json::Value'; // Use a generic value for unions
  }
  
  // Check for enum types
  if (type.type?.isEnumType && type.type.isEnumType()) {
    console.log("Found enum type");
    return 'String'; // Default representation for enums
  }

  // Handle complex types (structs, interfaces, classes)
  if (type.fqn) {
    // Convert FQN to Rust path
    const parts = type.fqn.split('.');
    const typeName = parts.pop() || '';
    
    // Handle the full path including assembly and submodules
    const fullPath = convertFqnToRustPath(type.fqn, currentAssemblyName);
    
    // Check if this is a trait (interface) type
    const isInterface = (type.type && type.type.isInterfaceType && type.type.isInterfaceType()) ||
                       (!type.type && (
                         type.fqn.includes('Props') || 
                         type.fqn.includes('Entry') ||
                         type.fqn.startsWith('I')
                       ));
    
    if (isInterface) {
      console.log(`Found interface type with FQN: ${type.fqn}, generating concrete wrapper: ${fullPath}Impl`);
      // For interfaces, return a concrete wrapper type that can be serialized
      return `${fullPath}Impl`;
    }
    
    console.log(`Found complex/reference type with FQN: ${type.fqn}, Current: ${currentAssemblyName}, Rust type: ${fullPath}`);
    return fullPath;
  }
  
  // Default case
  console.log("Unable to determine type:", 
    type.constructor ? type.constructor.name : typeof type);
  return '()';
}

function isTraitType(type: any): boolean {
  console.log("DEBUG: isTraitType called with type.fqn:", type.fqn, "type.primitive:", type.primitive);
  
  // For collections, we don't want to use trait objects because they can't be easily serialized
  // Rust doesn't allow trait objects (Box<dyn Trait>) in collections that need to be serialized/deserialized
  // Instead, we'll always generate concrete wrapper types for interfaces
  // These concrete wrappers have a `jsii_object_ref` field and implement the trait, allowing both serialization and API compliance
  // So we return false here to avoid Box<dyn> wrapping in collections and always use concrete types
  
  // Check if it's a trait (interface) type by examining various properties
  if (type.type && type.type.isInterfaceType && type.type.isInterfaceType()) {
    console.log("DEBUG: Found trait via type.type.isInterfaceType - but using concrete type for serialization");
    return false; // Use concrete types instead of trait objects
  }
  
  // Alternative check: if it has an FQN, we can look up the type definition
  if (type.fqn && type.type) {
    const result = type.type.isInterfaceType && type.type.isInterfaceType();
    console.log("DEBUG: Found trait via type.fqn and type.type.isInterfaceType:", result, "- but using concrete type");
    return false; // Use concrete types instead of trait objects
  }
  
  // Check if it's a direct reference to an interface by examining known interface FQNs
  if (type.fqn && !type.type) {
    // This is a heuristic based on known interface patterns
    // Only treat as trait if it matches known interface patterns
    const knownInterfaceFqns = [
      'jsii-calc.DummyObj',
      '@scope/jsii-calc-base.BaseProps',
      'scope_jsii_calc_lib.submodule.ReflectableEntry'
    ];
    
    const isKnownInterface = knownInterfaceFqns.includes(type.fqn) || 
                           type.fqn.includes('Props') || 
                           type.fqn.includes('Entry') ||
                           type.fqn.endsWith('Obj') ||  // Common suffix for interface types like DummyObj
                           type.fqn.startsWith('I'); // Interface naming convention
    
    console.log("DEBUG: Found FQN without type object, checking if known interface:", type.fqn, "isKnownInterface:", isKnownInterface, "- but using concrete type");
    return false; // Use concrete types instead of trait objects for now
  }
  
  console.log("DEBUG: No trait type detected");
  return false;
}

function makeConcreteWrapperType(type: any, currentAssemblyName?: string): string {
  // For interface types, generate a concrete wrapper struct name
  // This allows for serialization while maintaining the interface API
  
  if (type.fqn) {
    const fullPath = convertFqnToRustPath(type.fqn, currentAssemblyName);
    
    // Check if it's an interface type (trait)
    const isInterface = (type.type && type.type.isInterfaceType && type.type.isInterfaceType()) ||
                       (!type.type && (
                         type.fqn.includes('Props') || 
                         type.fqn.includes('Entry') ||
                         type.fqn.endsWith('Obj') ||
                         type.fqn.startsWith('I')
                       ));
    
    if (isInterface) {
      // For interfaces, we generate a concrete wrapper type
      // The wrapper will have the same name but will be a struct instead of a trait
      // This struct implements the trait and has a public jsii_object_ref field
      // allowing it to be serialized/deserialized while maintaining API compatibility
      console.log(`DEBUG: Generating concrete wrapper for interface: ${type.fqn} -> ${fullPath}Impl`);
      return `${fullPath}Impl`;
    }
    
    return fullPath;
  }
  
  return makeRustType(type, currentAssemblyName);
}