# Constants Helpers

This directory contains helper classes and utilities that support the constants management system. These helpers provide specialized functionality for retrieving, parsing, and building constants from YAML configuration files.

## Overview

The constants helpers are organized into four main classes:

- **Core Builder**: [`ConstantsBuilder`](#constantsbuilder-flexible-loader)
- **File Management**: [`ConstantsGetter`](#constantsgetter)
- **Parsing & Processing**: [`ConstantsParser`](#constantsparser)
- **Manifest Validation**: [`ManifestParser`](#manifestparser)

## Core Builder

### ConstantsBuilder (Flexible Loader)

**File**: `constantsBuilder.js`  
**Dependencies**: `ConstantsParser`, `ConstantsGetter` (fallback)  
**Exports**: `ConstantsBuilder` (class)

Flexible loader for constants / defaults YAML with injectable sources and parser.

#### Constructor

```js
new ConstantsBuilder(options?)
```

#### Options (all optional)

| Option | Type | Description | Default |
| ------ | ---- | ----------- | ------- |
| `yamlString` | `string` | Raw YAML content (highest precedence) | `undefined` |
| `getter` | `() => string` | Custom synchronous provider | `undefined` |
| `yamlPath` | `string` | Filesystem path to YAML | `undefined` |
| `parser` | `function` | Custom parse fn `(yaml, globalNs, parseRootMap, moduleRef)` | `ConstantsParser.parseConstants` |
| `parseContextRootMap` | `boolean` | Whether to process root map directives | `true` |
| `globalNamespace` | `object` | Namespace for dynamic path resolution | `globalThis` |
| `moduleRef` | `any` | Module reference passed to parser | `null` |

Resolution precedence: `yamlString` > `getter()` > `yamlPath` > internal getter.

#### Getters

```js
instance.asString  // Original YAML
instance.asObject  // Parsed object (already built; freeze externally if needed)
```

#### Basic Usage

```js
import ConstantsBuilder from './helpers/constantsBuilder.js';

const builder = new ConstantsBuilder({ yamlPath: './config/constants.yaml' });
const constants = Object.freeze(builder.asObject);
```

#### Custom Parser

```js
const builder = new ConstantsBuilder({
  yamlString: 'foo: 1',
  parser: (yaml, g, parseRoot, mod) => ({ parsed: true, ...{ foo: 1 } }),
  parseContextRootMap: false
});
console.log(builder.asObject.parsed); // true
```

#### Disabling Root Map Processing

```js
new ConstantsBuilder({ yamlPath: './config/defaults.yaml', parseContextRootMap: false });
```

#### Testing Strategy

- Mock via `jest.unstable_mockModule('./helpers/constantsGetter.js')`
- Inject raw YAML with `yamlString` to avoid filesystem
- Supply a stub parser to assert parse arguments

#### Internal Behavior Summary

- Resolves source per precedence
- Invokes parser exactly once during construction
- Stores raw + parsed forms for cheap subsequent access

## File Management

### ConstantsGetter

**File**: constantsGetter.js
**Dependencies**: `fs`, `path`
**Exports**: `ConstantsGetter` (class)

Static utility class for reading constants from YAML files with configurable file names, encoding, and error handling.

#### ConstantsGetter API

```javascript
// Static Methods
ConstantsGetter.getConstantsYaml(constantsFileName, encoding)
// Parameters:
// - constantsFileName: string (optional) - The YAML file name (default: 'constants.yaml')
// - encoding: string (optional) - File encoding (default: 'utf8')
// Returns: string - The content of the YAML file
// Throws: Error if file cannot be read
```

#### ConstantsGetter Usage

```javascript
import ConstantsGetter from './helpers/constantsGetter.js';

// Read default constants.yaml file with default encoding
const defaultConstants = ConstantsGetter.getConstantsYaml();

// Read custom YAML file
const customConstants = ConstantsGetter.getConstantsYaml('custom-config.yaml');

// Read with custom encoding
const asciiConstants = ConstantsGetter.getConstantsYaml('constants.yaml', 'ascii');

// Read custom file with custom encoding
const customFile = ConstantsGetter.getConstantsYaml('config.yaml', 'utf16le');
```

#### Features

- **Default File**: Reads `constants.yaml` from project root by default
- **Custom Files**: Accepts custom file names for alternative configurations
- **Custom Encoding**: Supports configurable file encoding (default: UTF-8)
- **Path Resolution**: Uses `process.cwd()` as base directory
- **Error Handling**: Logs errors and re-throws them for upstream handling

#### Error Handling

```javascript
try {
  const constants = ConstantsGetter.getConstantsYaml('missing-file.yaml');
} catch (error) {
  console.error('Failed to read constants:', error.message);
  // Handle error appropriately


```javascript

## Parsing & Processing

### ConstantsParser

**File**: constantsParser.js
**Dependencies**: `js-yaml`, `lodash`, `PathUtils`
**Exports**: `ConstantsParser` (class)

Advanced YAML parsing with support for context root map creation and dynamic path resolution.

#### ConstantsParser API

```javascript
// Static Methods
ConstantsParser.parseConstants(constants, globalNamespace, parseContextRootMap, module)
ConstantsParser.createRootMapFromYaml(config, globalNamespace, module)

// Parameters:
// - constants: string - YAML string to parse
// - globalNamespace: Object - Global namespace for path resolution (default: globalThis)
// - parseContextRootMap: boolean - Whether to process context.rootMap (default: true)
// - module: Object - Module object for root map creation (default: null)
```

#### ConstantsParser Usage

```javascript
import ConstantsParser from './helpers/constantsParser.js';

// Basic parsing
const yamlString = 'testConstant: testValue\ncontext:\n  schema: test';
const parsed = ConstantsParser.parseConstants(yamlString);
console.log(parsed.testConstant); // 'testValue'

// Advanced parsing with root map processing
const parsedWithRootMap = ConstantsParser.parseConstants(
  yamlString,
  globalThis,
  true,
  moduleInstance
);

// Manual root map creation
const rootMapConfig = {
  rootMap: {
    game: 'game',
    module: 'module',
    window: 'globalNamespace.window'


  ```javascript
const rootMapFn = ConstantsParser.createRootMapFromYaml(rootMapConfig);
const rootMap = rootMapFn(globalThis, moduleInstance);
```

#### Root Map Processing

The parser can automatically process `context.remote.rootMap` configurations to create dynamic root map functions:

**YAML Configuration:**

```yaml
context:
  remote:
    rootMap:
      rootMap:
        game: "globalNamespace.game"
        module: "module"
        storage: "globalNamespace.localStorage"
        invalid: null
```

**Generated Function:**

```javascript
// The parser creates a function that returns:
{
  game: globalThis.game,           // Resolved from path
  module: moduleInstance,          // Direct module reference
  storage: globalThis.localStorage, // Resolved from path
  invalid: null                    // Null value preserved
}
```

#### Path Resolution

The parser uses `PathUtils.resolvePath()` to dynamically resolve object paths:

- **Regular Paths**: `"globalNamespace.game.user"` → `globalThis.game.user`
- **Module Keyword**: `"module"` → Direct module reference
- **Null Values**: `null` → Preserved as null
- **Invalid Paths**: Missing objects return `undefined`

#### ConstantsParser Error Handling


```javascript
try {
  const parsed = ConstantsParser.parseConstants(invalidYaml);
} catch (error) {
  console.error('Parsing failed:', error.message);
  // Error logged and re-thrown as generic "Failed to parse constants"


```javascript

#### Input Validation

- **Type Checking**: Validates that `constants` is a string
- **Boolean Validation**: Ensures `parseContextRootMap` is boolean
- **Error Messages**: Provides clear TypeError messages for invalid inputs

## Manifest Validation

### ManifestParser

**File**: manifestParser.js
**Dependencies**: `constants.js`
**Exports**: `ManifestParser` (class)

Comprehensive validation and processing for manifest objects with support for multiple validation strategies and immutability enforcement. Validates manifest structure, required attributes, and ensures immutability by freezing the manifest and its nested objects.

#### ManifestParser API

```javascript
// Constructor
new ManifestParser(manifest)

// Validation Methods
.validateRequiredManifestAttributes()    // Validates required attributes are defined
.validateImportedManifest()             // Validates manifest structure and type
.validateManifestAttributesArray()      // Validates array-based required attributes
.validateManifestAttributesObject()     // Validates object-based required attributes
.validateManifestHasRequiredAttributes() // Orchestrates validation based on attribute type
.freezeManifest()                       // Makes manifest immutable
.getValidatedManifest()                 // Main entry point - performs complete validation

// Properties
.manifest           // The manifest object being validated
.requiredAttributes // Required attributes configuration from constants
```

#### ManifestParser Usage

```javascript
import ManifestParser from './helpers/manifestParser.js';

// Basic manifest validation
const manifestData = {
  id: "my-module",
  title: "My Module",
  description: "A Foundry VTT module",
  version: "1.0.0"
};

const parser = new ManifestParser(manifestData);
const validatedManifest = parser.getValidatedManifest();

// The returned manifest is validated and frozen
console.log(Object.isFrozen(validatedManifest)); // true
console.log(validatedManifest.id); // "my-module"
```

#### Validation Features

**Required Attributes Support:**

- **Array Format**: `["id", "title", "description", "version"]`
- **Object Format**: `{ id: true, title: true, description: true, version: true }`
- **Type Validation**: Ensures array elements are strings
- **Presence Validation**: Verifies all required attributes exist in manifest

**Manifest Structure Validation:**
```javascript
// Valid manifest - object with required properties
const validManifest = {
  id: "module-id",
  title: "Module Title",
  description: "Module description",
  version: "1.0.0"
};

// Invalid manifests that will throw errors
const invalidManifests = [
  null,                    // Error: "Manifest data is not available"
  undefined,               // Error: "Manifest data is not available"
  [],                      // Error: "Manifest data is not an object"
  "string",                // Error: "Manifest data is not an object"
  123,                     // Error: "Manifest data is not an object"
  { id: "test" }          // Error: "Manifest is missing required attribute: title"
];
```

**Immutability Enforcement:**
```javascript
const parser = new ManifestParser(manifestData);
const frozen = parser.getValidatedManifest();

// Manifest and nested objects are frozen
console.log(Object.isFrozen(frozen)); // true
console.log(Object.isFrozen(frozen.compatibility)); // true (if exists)
console.log(Object.isFrozen(frozen.authors)); // true (if exists)

// Attempts to modify will fail silently or throw in strict mode
frozen.id = "new-id"; // No effect
frozen.newProperty = "value"; // No effect
```

#### Error Handling (ManifestParser)

The ManifestParser provides detailed error messages for different validation failures:

```javascript
try {
  const parser = new ManifestParser(invalidManifest);
  const validated = parser.getValidatedManifest();
} catch (error) {
  // Specific error messages help identify issues:
  // "Required manifest attributes are not defined in constants."
  // "Manifest data is not available."
  // "Manifest data is not an object."
  // "Manifest is missing required attribute: title"
  // "Required manifest attribute \"123\" is not a string."
  // "Required manifest attributes must be an array or an object."
  console.error('Manifest validation failed:', error.message);


```javascript

#### Validation Process Flow

The `getValidatedManifest()` method executes validation in this order:

1. **Constants Validation**: Ensures required attributes are defined
2. **Manifest Structure**: Validates manifest exists and is an object
3. **Required Attributes**: Validates all required attributes are present
4. **Immutability**: Freezes manifest and nested objects
5. **Return**: Returns the validated, frozen manifest

#### Advanced Usage Patterns

**Custom Required Attributes:**
```javascript
const parser = new ManifestParser(manifestData);
parser.requiredAttributes = ["id", "title"]; // Override defaults
const validated = parser.getValidatedManifest();
```

**Step-by-Step Validation:**
```javascript
const parser = new ManifestParser(manifestData);

// Validate individually for debugging
parser.validateRequiredManifestAttributes();
parser.validateImportedManifest();
parser.validateManifestHasRequiredAttributes();
parser.freezeManifest();

// Or use all-in-one method
const result = parser.getValidatedManifest();
```

**Real-World Manifest Processing:**
```javascript
// Complex manifest with nested objects
const complexManifest = {
  id: "advanced-module",
  title: "Advanced Module",
  description: "A complex Foundry VTT module",
  version: "2.1.0",
  compatibility: {
    minimum: "11",
    verified: "12"
  },
  authors: [
    { name: "Developer", email: "dev@example.com" }
  ],
  scripts: ["scripts/init.js"],
  styles: ["styles/main.css"],
  languages: [
    { lang: "en", name: "English", path: "lang/en.json" }
  ]
};

const parser = new ManifestParser(complexManifest);
const validated = parser.getValidatedManifest();

// All nested objects are also frozen
console.log(Object.isFrozen(validated.compatibility)); // true
console.log(Object.isFrozen(validated.authors)); // true
console.log(Object.isFrozen(validated.languages)); // true
```bash

## Constants Structure

The helpers work with a YAML structure defined in `constants.yaml` at the project root. Key sections include:

### Module Configuration

```yaml
moduleManagement:
  referToModuleBy: "title"
  defaults:
    modulesLocation: "game.modules"
```text

### Error Formatting

```yaml
errors:
  separator: " || "
  pattern: "{{module}}{{caller}}{{error}}{{stack}}"
```

### Context Management

```yaml
context:
  operationsParams:
    defaults:
      alwaysPullBeforeGetting: false
      alwaysPushAfterSetting: false
      # ... more defaults

  external:
    defaults:
      rootIdentifier: "module"
      pathFromRoot: "context"
    rootMap:
      window: "globalNamespace.window"
      game: "globalNamespace.game"
      module: "module"
      # ... more mappings

  sync:
    defaults:
      autoSync: true
      syncStrategy: "mergeNewerWins"
      # ... more sync settings
```

### Context Helpers Constants

```yaml
contextHelpers:
  mergeStrategies:
    MERGE_NEWER_WINS: "mergeNewerWins"
    # ... more strategies

  comparisonResults:
    SOURCE_NEWER: "sourceNewer"
    # ... more results

  errorMessages:
    invalidSourceTarget: "Source and target contexts must be provided"
    # ... more error messages
```

## Testing

Each helper class includes comprehensive unit tests with the following patterns:

### Test Structure

- **File Naming**: `*.unit.test.js` for unit tests
- **Mocking**: External dependencies are mocked using Jest
- **Coverage**: Tests cover success cases, error cases, and edge cases

### Running Tests

```bash
# Run all constants helper tests
npm test constants/helpers

# Run specific test file
npm test -- --testPathPattern="constantsBuilder.unit.test.js"
npm test -- --testPathPattern="constantsGetter.unit.test.js"
npm test -- --testPathPattern="constantsParser.unit.test.js"
npm test -- --testPathPattern="manifestParser.unit.test.js"
```

### Test Coverage Areas

#### ConstantsBuilder Tests

- Instance creation and initialization
- Property access (`asString`, `asObject`)
- Caching behavior and performance
- Error handling from dependencies
- Empty YAML handling

#### ConstantsGetter Tests

- Default file reading (`constants.yaml`)
- Custom file name support
- Default and custom encoding support
- Path resolution behavior
- File system error handling
- Parameter combinations (file + encoding)

#### ConstantsParser Tests

- Basic YAML parsing functionality
- Input validation and type checking
- Root map creation and processing
- Path resolution with `PathUtils`
- Special value handling (`module`, `null`)
- Error logging and re-throwing
- Edge cases and malformed input

#### ManifestParser Tests

- Constructor initialization with various manifest types
- Required attributes validation (array and object formats)
- Manifest structure validation (null, array, object checks)
- Missing required attributes detection
- Manifest freezing and immutability enforcement
- Complete validation workflow (`getValidatedManifest`)
- Error message accuracy and specificity
- Edge cases (empty manifests, complex nested structures)
- Integration with constants configuration

## Dependencies Graph

```
ConstantsBuilder
├── ConstantsGetter
│   ├── fs (Node.js)
│   └── path (Node.js)
└── ConstantsParser
    ├── js-yaml (external)
    ├── lodash (external)
    └── PathUtils (../../helpers)

ManifestParser
└── constants.js (../constants.js)
```

## Usage Patterns

### Basic Constants Access

```javascript
import ConstantsBuilder from './constants/helpers/constantsBuilder.js';

const constants = new ConstantsBuilder();
const config = constants.asObject;

// Access configuration values
const moduleRef = config.referToModuleBy;
const syncDefaults = config.context.sync.defaults;
const errorPattern = config.errors.pattern;
```

### Custom Configuration Files

```javascript
import ConstantsGetter from './constants/helpers/constantsGetter.js';
import ConstantsParser from './constants/helpers/constantsParser.js';

// Read custom configuration with default encoding
const customYaml = ConstantsGetter.getConstantsYaml('environment-specific.yaml');
const customConfig = ConstantsParser.parseConstants(customYaml, globalThis, false);

// Read with custom encoding
const binaryYaml = ConstantsGetter.getConstantsYaml('binary-config.yaml', 'binary');
```

### Advanced Root Map Usage

```javascript
import ConstantsParser from './constants/helpers/constantsParser.js';

// Parse with root map processing for context management
const fullConfig = ConstantsParser.parseConstants(
  yamlString,
  globalThis,    // Global namespace
  true,          // Process root map
  moduleInstance // Module reference
);

// Access generated root map function
const rootMapFn = fullConfig.context.rootMap;
const rootMap = rootMapFn(globalThis, moduleInstance);
```

### Integration with Context System

```javascript
import ConstantsBuilder from './constants/helpers/constantsBuilder.js';

const constants = new ConstantsBuilder();
const contextConfig = constants.asObject.context;

// Use in context initialization
const context = new Context({
  syncDefaults: contextConfig.sync.defaults,
  operationParams: contextConfig.operationsParams.defaults,
  rootMap: contextConfig.external.rootMap
});
```

### Manifest Validation Integration

```javascript
import ManifestParser from './constants/helpers/manifestParser.js';

// Validate imported manifest
import rawManifest from '../module.json';
const parser = new ManifestParser(rawManifest);
const validatedManifest = parser.getValidatedManifest();

// Use validated manifest safely
console.log(`Module: ${validatedManifest.title} v${validatedManifest.version}`);
console.log(`ID: ${validatedManifest.id}`);

// Manifest is frozen and immutable
Object.isFrozen(validatedManifest); // true
```

### Module Initialization Pattern

```javascript
import ManifestParser from './constants/helpers/manifestParser.js';
import ConstantsBuilder from './constants/helpers/constantsBuilder.js';

// Combined initialization
const constants = new ConstantsBuilder();
const config = constants.asObject;

// Validate manifest with current constants
import moduleManifest from '../module.json';
const manifestParser = new ManifestParser(moduleManifest);
const manifest = manifestParser.getValidatedManifest();

// Initialize module with validated data
const moduleInstance = {
  id: manifest.id,
  title: manifest.title,
  version: manifest.version,
  config: config,
  manifest: manifest
};
```

## Performance Considerations

- **Caching**: `ConstantsBuilder` caches both string and object representations
- **Lazy Loading**: Constants are only loaded when `ConstantsBuilder` is instantiated
- **Memory Efficiency**: Deep cloning is handled by the YAML parser
- **File I/O**: File reading occurs once during construction, not on each access
- **Encoding Flexibility**: Support for different file encodings without performance penalty

## Error Handling Strategy

All helpers follow a consistent error handling approach:

1. **Validation**: Input parameters are validated with descriptive error messages
2. **Logging**: Errors are logged to console for debugging
3. **Re-throwing**: Original errors are preserved and re-thrown for upstream handling
4. **Type Safety**: TypeError is thrown for invalid input types
5. **File System**: Clear error messages for file reading failures

## Future Enhancements

- **Configuration Validation**: Schema validation for YAML structure
- **Hot Reloading**: Dynamic configuration updates during development
- **Environment Overrides**: Environment-specific configuration merging
- **Caching Strategies**: More sophisticated caching with invalidation
- **Performance Monitoring**: Metrics for parsing and access times
- **Encoding Detection**: Automatic encoding detection for files

All helpers follow the established coding conventions with ES6 syntax, proper error handling, and comprehensive JSDoc documentation.
