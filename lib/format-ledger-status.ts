export function formatLedgerStatus(status: string) {
  switch (status.trim().toUpperCase()) {
    case "POSTED":
    case "COMPLETED":
    case "CREDITED":
    case "APPROVED":
    case "INCOME_CREDITED":
      return "Completed";
    case "PENDING":
      return "Pending";
    case "PROCESSING":
      return "Processing";
    case "CONFIRMING":
    case "CONFIRMED":
    case "DETECTED":
      return "Confirming";
    case "FAILED":
    case "REJECTED":
    case "EXPIRED":
      return "Failed";
    case "CANCELLED":
    case "CANCELED":
      return "Cancelled";
    case "REVERSED":
      return "Reversed";
    default:
      return status;
  }
}
