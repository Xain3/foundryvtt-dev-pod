/**
 * Example demonstrating how to use the new secret provider layer for testing.
 * This shows how easy it is to mock cloud providers without requiring actual CLI tools.
 */

const { resolveSecrets } = require('../scripts/generate-compose.js');

// Example 1: Mock all providers for comprehensive testing
function createMockProviders() {
  return {
    getGcpSecret: jest.fn().mockReturnValue('{"foundry_license": "gcp-test-license"}'),
    getAzureSecret: jest.fn().mockReturnValue('{"foundry_license": "azure-test-license"}'),
    getAwsSecret: jest.fn().mockReturnValue('{"foundry_license": "aws-test-license"}')
  };
}

// Example 2: Test GCP secret retrieval
function testGcpSecretRetrieval() {
  const mockProviders = createMockProviders();
  
  const result = resolveSecrets({
    secretsMode: 'gcp',
    secretsGcpProject: 'my-project',
    secretsGcpSecret: 'foundry-secrets'
  }, mockProviders);

  console.log('GCP secret resolved:', {
    topLevel: Object.keys(result.topLevel),
    serviceRef: result.serviceRef
  });

  // Verify the provider was called correctly
  expect(mockProviders.getGcpSecret).toHaveBeenCalledWith('my-project', 'foundry-secrets');
  
  // Clean up temp file
  const secretFile = result.topLevel.config_json_gcp?.file;
  if (secretFile && require('fs').existsSync(secretFile)) {
    require('fs').unlinkSync(secretFile);
  }
}

// Example 3: Test error scenarios
function testErrorHandling() {
  const mockProviders = {
    getGcpSecret: jest.fn().mockImplementation(() => {
      throw new Error('gcloud not authenticated');
    })
  };

  expect(() => {
    resolveSecrets({
      secretsMode: 'gcp',
      secretsGcpProject: 'my-project',
      secretsGcpSecret: 'foundry-secrets'
    }, mockProviders);
  }).toThrow('Failed to retrieve GCP secret: gcloud not authenticated');
}

// Example 4: Test auto-detection with multiple providers
function testAutoDetection() {
  const mockProviders = createMockProviders();
  
  // Auto-detect should pick Azure when Azure params are provided
  const result = resolveSecrets({
    secretsMode: 'auto',
    secretsAzureVault: 'my-vault',
    secretsAzureSecret: 'foundry-secrets'
  }, mockProviders);

  expect(mockProviders.getAzureSecret).toHaveBeenCalledWith('my-vault', 'foundry-secrets');
  expect(mockProviders.getGcpSecret).not.toHaveBeenCalled();
  expect(mockProviders.getAwsSecret).not.toHaveBeenCalled();

  // Clean up temp file
  const secretFile = result.topLevel.config_json_azure?.file;
  if (secretFile && require('fs').existsSync(secretFile)) {
    require('fs').unlinkSync(secretFile);
  }
}

// Example 5: Integration test demonstrating the abstraction
function integrationExample() {
  console.log('Secret Provider Layer Example');
  console.log('============================');
  
  // Before: Hard to test because it required actual cloud CLI tools
  // After: Easy to test with dependency injection
  
  const mockProviders = {
    getGcpSecret: (project, secret) => {
      console.log(`Mock GCP call: project=${project}, secret=${secret}`);
      return JSON.stringify({
        foundry_license: 'test-license-123',
        foundry_password: 'test-password-456'
      });
    },
    getAzureSecret: (vault, secret) => {
      console.log(`Mock Azure call: vault=${vault}, secret=${secret}`);
      return JSON.stringify({
        foundry_license: 'azure-license-789'
      });
    },
    getAwsSecret: (region, secret) => {
      console.log(`Mock AWS call: region=${region}, secret=${secret}`);
      return JSON.stringify({
        foundry_license: 'aws-license-xyz'
      });
    }
  };

  console.log('\n1. Testing GCP provider:');
  const gcpResult = resolveSecrets({
    secretsMode: 'gcp',
    secretsGcpProject: 'test-project',
    secretsGcpSecret: 'foundry-config'
  }, mockProviders);
  
  console.log('Result:', {
    secrets: Object.keys(gcpResult.topLevel),
    serviceRefs: gcpResult.serviceRef.length
  });

  // Clean up
  const gcpFile = gcpResult.topLevel.config_json_gcp?.file;
  if (gcpFile && require('fs').existsSync(gcpFile)) {
    require('fs').unlinkSync(gcpFile);
  }

  console.log('\n2. Testing Azure provider:');
  const azureResult = resolveSecrets({
    secretsMode: 'azure',
    secretsAzureVault: 'test-vault',
    secretsAzureSecret: 'foundry-config'
  }, mockProviders);
  
  console.log('Result:', {
    secrets: Object.keys(azureResult.topLevel),
    serviceRefs: azureResult.serviceRef.length
  });

  // Clean up
  const azureFile = azureResult.topLevel.config_json_azure?.file;
  if (azureFile && require('fs').existsSync(azureFile)) {
    require('fs').unlinkSync(azureFile);
  }

  console.log('\n3. Testing auto-detection:');
  const autoResult = resolveSecrets({
    secretsMode: 'auto',
    secretsAwsRegion: 'us-east-1',
    secretsAwsSecret: 'foundry-config'
  }, mockProviders);
  
  console.log('Auto-detected AWS, result:', {
    secrets: Object.keys(autoResult.topLevel),
    serviceRefs: autoResult.serviceRef.length
  });

  // Clean up
  const awsFile = autoResult.topLevel.config_json_aws?.file;
  if (awsFile && require('fs').existsSync(awsFile)) {
    require('fs').unlinkSync(awsFile);
  }

  console.log('\nDone! The secret provider layer makes testing much easier.');
}

module.exports = {
  createMockProviders,
  testGcpSecretRetrieval,
  testErrorHandling,
  testAutoDetection,
  integrationExample
};

// Run example if this file is executed directly
if (require.main === module) {
  integrationExample();
}