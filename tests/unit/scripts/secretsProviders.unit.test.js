const { getGcpSecret, getAzureSecret, getAwsSecret, defaultProviders } = require('../../../scripts/secretsProviders.js');

describe('scripts/secretsProviders.js', () => {
  describe('exports', () => {
    test('exports individual provider functions', () => {
      expect(typeof getGcpSecret).toBe('function');
      expect(typeof getAzureSecret).toBe('function');
      expect(typeof getAwsSecret).toBe('function');
    });

    test('exports defaultProviders object with all providers', () => {
      expect(typeof defaultProviders).toBe('object');
      expect(typeof defaultProviders.getGcpSecret).toBe('function');
      expect(typeof defaultProviders.getAzureSecret).toBe('function');
      expect(typeof defaultProviders.getAwsSecret).toBe('function');
    });

    test('defaultProviders functions are same as individual exports', () => {
      expect(defaultProviders.getGcpSecret).toBe(getGcpSecret);
      expect(defaultProviders.getAzureSecret).toBe(getAzureSecret);
      expect(defaultProviders.getAwsSecret).toBe(getAwsSecret);
    });
  });

  describe('mocking capabilities', () => {
    test('providers can be easily mocked for testing', () => {
      // Create mock providers
      const mockProviders = {
        getGcpSecret: jest.fn().mockReturnValue('{"gcp": "secret"}'),
        getAzureSecret: jest.fn().mockReturnValue('{"azure": "secret"}'),
        getAwsSecret: jest.fn().mockReturnValue('{"aws": "secret"}')
      };

      // Test GCP provider mocking
      const gcpResult = mockProviders.getGcpSecret('test-project', 'test-secret');
      expect(gcpResult).toBe('{"gcp": "secret"}');
      expect(mockProviders.getGcpSecret).toHaveBeenCalledWith('test-project', 'test-secret');

      // Test Azure provider mocking
      const azureResult = mockProviders.getAzureSecret('test-vault', 'test-secret');
      expect(azureResult).toBe('{"azure": "secret"}');
      expect(mockProviders.getAzureSecret).toHaveBeenCalledWith('test-vault', 'test-secret');

      // Test AWS provider mocking
      const awsResult = mockProviders.getAwsSecret('us-east-1', 'test-secret');
      expect(awsResult).toBe('{"aws": "secret"}');
      expect(mockProviders.getAwsSecret).toHaveBeenCalledWith('us-east-1', 'test-secret');
    });

    test('providers can simulate errors for error handling tests', () => {
      const mockProviders = {
        getGcpSecret: jest.fn().mockImplementation(() => {
          throw new Error('GCP authentication failed');
        }),
        getAzureSecret: jest.fn().mockImplementation(() => {
          throw new Error('Azure CLI not installed');
        }),
        getAwsSecret: jest.fn().mockImplementation(() => {
          throw new Error('AWS credentials not configured');
        })
      };

      expect(() => mockProviders.getGcpSecret('project', 'secret')).toThrow('GCP authentication failed');
      expect(() => mockProviders.getAzureSecret('vault', 'secret')).toThrow('Azure CLI not installed');
      expect(() => mockProviders.getAwsSecret('region', 'secret')).toThrow('AWS credentials not configured');
    });

    test('providers can be partially mocked', () => {
      // Mock only specific providers while keeping others as defaults
      const partialMockProviders = {
        ...defaultProviders,
        getGcpSecret: jest.fn().mockReturnValue('{"mocked": "gcp"}')
      };

      // The mocked provider should work
      const gcpResult = partialMockProviders.getGcpSecret('project', 'secret');
      expect(gcpResult).toBe('{"mocked": "gcp"}');
      expect(partialMockProviders.getGcpSecret).toHaveBeenCalledWith('project', 'secret');

      // The non-mocked providers should still be the originals
      expect(partialMockProviders.getAzureSecret).toBe(getAzureSecret);
      expect(partialMockProviders.getAwsSecret).toBe(getAwsSecret);
    });
  });

  describe('provider interface consistency', () => {
    test('all providers accept expected parameters', () => {
      // These tests don't actually call the real providers to avoid requiring CLI tools
      // We just test that the functions exist and have the expected signatures
      expect(getGcpSecret.length).toBe(2); // project, secretName
      expect(getAzureSecret.length).toBe(2); // vaultName, secretName
      expect(getAwsSecret.length).toBe(2); // region, secretName
    });
  });

  describe('integration with generate-compose', () => {
    test('providers object can be injected into resolveSecrets', () => {
      // Import the function that uses the providers
      const { resolveSecrets } = require('../../../scripts/generate-compose.js');

      const mockProviders = {
        getGcpSecret: jest.fn().mockReturnValue('{"test": "gcp-secret"}')
      };

      const result = resolveSecrets({
        secretsMode: 'gcp',
        secretsGcpProject: 'test-project',
        secretsGcpSecret: 'test-secret'
      }, mockProviders);

      expect(mockProviders.getGcpSecret).toHaveBeenCalledWith('test-project', 'test-secret');
      expect(result.topLevel).toHaveProperty('config_json_gcp');
      expect(result.serviceRef).toEqual([{
        source: 'config_json_gcp',
        target: 'config.json'
      }]);

      // Clean up temp file
      const secretFile = result.topLevel.config_json_gcp.file;
      if (require('fs').existsSync(secretFile)) {
        require('fs').unlinkSync(secretFile);
      }
    });
  });
});