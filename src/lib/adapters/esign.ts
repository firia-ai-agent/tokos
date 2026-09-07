import { SignatureRequestApi, SignatureRequestSendRequest, SubSignatureRequestSigner } from "@dropbox/sign";
import { appUrl, hasDropboxSign } from "@/lib/env";
import { phiSafeIds } from "@/lib/phi";

export type EsignCreateInput = {
  organizationId: string;
  contractId: string;
  signerName: string;
  signerEmail: string;
  title: string;
};

export async function createSignatureRequest(input: EsignCreateInput) {
  const returnUrl = `${appUrl()}/api/esign/return?contractId=${input.contractId}`;
  const metadata = phiSafeIds({
    organizationId: input.organizationId,
    contractId: input.contractId,
  });

  if (!hasDropboxSign()) {
    return {
      provider: "stub" as const,
      externalId: `stub-esign-${input.contractId}`,
      signUrl: `${appUrl()}/stub/sign?contractId=${input.contractId}`,
      rawStatus: "awaiting_signature",
    };
  }

  const api = new SignatureRequestApi();
  api.setApiKey(process.env.DROPBOX_SIGN_API_KEY!);

  const signer = new SubSignatureRequestSigner();
  signer.name = input.signerName;
  signer.emailAddress = input.signerEmail;

  const request = new SignatureRequestSendRequest();
  request.title = input.title;
  request.subject = input.title;
  request.message = "Please review and sign your care agreement.";
  request.signers = [signer];
  request.metadata = metadata;
  request.testMode = true;
  request.signingRedirectUrl = returnUrl;

  const { body } = await api.signatureRequestSend(request);
  const signatureRequest = body.signatureRequest;
  const signUrl =
    signatureRequest?.signingUrl ||
    signatureRequest?.detailsUrl ||
    returnUrl;

  return {
    provider: "dropbox_sign" as const,
    externalId: signatureRequest?.signatureRequestId || `hs-${input.contractId}`,
    signUrl,
    rawStatus: signatureRequest?.isComplete ? "signed" : "awaiting_signature",
  };
}
