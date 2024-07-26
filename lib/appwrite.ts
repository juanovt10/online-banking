"use server"; // all functions exported in these file are server actions

import { Client, Account, Databases, Users } from "node-appwrite";
import { cookies } from "next/headers";

export async function createSessionClient() {

  // here it creates a client that focus on the endpoint and project
  // so its aware what will modify 
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!);

  // creates a session
  const session = cookies().get("appwrite-session");

  // checks if a session exist
  if (!session || !session.value) {
    throw new Error("No session");
  }

  // if not, it creates a new session
  client.setSession(session.value);

  // returns the account
  return {
    get account() {
      return new Account(client);
    },
  };
}

export async function createAdminClient() {

  // creates the admin client and will be able to do 
  // anything with the appwrite project (API key has all the scopes) 
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
    .setKey(process.env.NEXT_APPWRITE_KEY!);


  return {
    get account() {
      return new Account(client);
    },
    get database() {
      return new Databases(client);
    },
    get user() {
      return new Users(client);
    }
  };
}
