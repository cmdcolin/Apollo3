declare const _exports: {
    extensionsToTreatAsEsm: string[];
    transform: {
        ["^.+\\.m?tsx?$"]: ["ts-jest", {
            useESM: true;
        } & import("ts-jest").DefaultEsmTransformOptions];
    };
    automock: boolean;
    setupFiles: string[];
    collectCoverageFrom: string[];
};
export = _exports;
//# sourceMappingURL=jest.config.d.cts.map