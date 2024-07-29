'use server';

import { ID } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";
import { plaidClient } from "../plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env

export const signIn = async ({ email, password }: signInProps) => {
  try {
    const { account } = await createAdminClient();
    
    const response = await account.createEmailPasswordSession(email, password);

    return parseStringify(response);

  } catch (error) {
    console.error('Error', error)
  }
}

// this method must do ALL of the following three things:
// 1. Cretae a user and save it into the database
// 2. Create a user and save it into the browser cookies
// 3. create a user and link it to Plaid
export const signUp = async ({ password, ...userData}: SignUpParams) => {
  // destructure the data from the form
  const { email, firstName, lastName } = userData;

  // initiate newUserAccount variable
  let newUserAccount;

  try {
    const { account, database } = await createAdminClient();

    newUserAccount =await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`,
    );

    // break the method if the newUserAccount is not there
    if(!newUserAccount) throw new Error('Error creating user')
    
    // create a Dwolla customerUrl comming from dwolla actions
    const dwollaCustomerUrl = await createDwollaCustomer({
      ...userData,
      type: 'personal'
    });

    // check now if we received the dwolla custoemr URL
    if(!dwollaCustomerUrl) throw new Error('Error creating Dwolla customer')

    // extract the customer ID from the URL
    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    // create a new database document for the user collection
    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId: newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl
      },
    );

    // create the session
    const session = await account.createEmailPasswordSession(email, password);

    // store the session in the cookues
    cookies().set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    // return the newUser data from the database
    return parseStringify(newUser);

  } catch (error) {
    console.error('Error', error)
  }
}


export async function getLoggedInUser() {
  try {
    const { account } = await createSessionClient();
    const user = await account.get();

    return parseStringify(user);
  } catch (error) {
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();

    cookies().delete('appwrite-session');

    await account.deleteSession("current");

  } catch (error) {
    return null;
  }
}

export const createLinkToken = async (user: User) => {
  try {

    // define the token parameters
    // use the specific strucutre provided by plaid
    const tokenParams = {
      user: {
        client_user_id: user.$id
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ['auth'] as Products[],
      language: 'en',
      country_codes: ['US'] as CountryCode[],
    }

    // store the response from the linkTokenMethdo with the params
    // defined above. Note that the plaidClient was defiend in the
    // plaid.ts file as the API call that has the access to plaid
    const response = await plaidClient.linkTokenCreate(tokenParams);

    // return the linkToken from the method above
    return parseStringify({ linkToken: response.data.link_token});

  } catch(error) {
    console.log(error)
  }
}

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  sharableId
  }: createBankAccountProps) => {
    try {
      // get access to the database in appwrite
      const { database } = await createAdminClient();

      // create a new document in the database
      // here we pass the database ID and colleciton ID from .env
      // then an unique ID for the database document
      // finally the data that will be filled
      const bankAccount = await database.createDocument(
        DATABASE_ID!,
        BANK_COLLECTION_ID!,
        ID.unique(),
        {
          userId,
          bankId,
          accountId,
          accessToken,
          fundingSourceUrl,
          sharableId
        }
      )

      return parseStringify(bankAccount);

    } catch (error) {
      console.log(error)
    }
}

export const exchangePublicToken = async ({ publicToken, user }: exchangePublicTokenProps) => {
  try {

    // Exchange public token for access token and item ID
    // here we provide the publicToken to the itemPublicTokenExchange method
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    // Here we get the access token and item id from the response
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // get the account information using the access token from the
    // response with the accountsGet method
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    // get the account data from the accountsResponse
    const accountData = accountsResponse.data.accounts[0];

    // Create processor token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: 'dwolla' as ProcessorTokenCreateRequestProcessorEnum,
    };

    // here we get the processor token response and extract the actual
    // token from the response
    const processorTokenResponse = await plaidClient.processorTokenCreate(request);
    const processorToken = processorTokenResponse.data.processor_token;

    // Create a funding source URL for teh account using Dwolla customer ID,
    // processor token and bank name
    const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    });

    // check if the fundin source exisits
    if (!fundingSourceUrl) throw Error;

    // if the funding source exist create a bank account using the user ID,
    // item ID, account ID, access token, funding source URL and sharable Id
    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      sharableId: encryptId(accountData.account_id)
    });

    // revalidate path to reflect changes
    revalidatePath('/');

    // return a success message
    return parseStringify({
      publicTokenExchange: 'complete',
    });

  } catch(error) {
    console.log(error)
  }
}