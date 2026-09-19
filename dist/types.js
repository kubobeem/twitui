export class RpcError extends Error {
    kind;
    code;
    data;
    constructor(code, message, kind, data = {}) {
        super(message);
        this.name = 'RpcError';
        this.code = code;
        this.kind = kind;
        this.data = data;
    }
}
