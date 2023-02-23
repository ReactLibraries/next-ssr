module.exports = {
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\\.(ts|tsx)$': ['@swc-node/jest'],
  },
};
