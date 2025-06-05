from enum import Enum

class ErrorType(Enum):
    VALIDATION_ERROR = "validation_error"
    BLOCKCHAIN_ERROR = "blockchain_error"
    AUTHENTICATION_ERROR = "authentication_error"
    RESOURCE_NOT_FOUND = "resource_not_found"
    INSUFFICIENT_FUNDS = "insufficient_funds"
    CONTRACT_LOGIC_ERROR = "contract_logic_error"
    SERVICE_UNAVAILABLE = "service_unavailable"
    INTERNAL_ERROR = "internal_error"
    CARTESI_ERROR = "cartesi_error"
    DATABASE_ERROR = "database_error"
    NETWORK_ERROR = "network_error"
