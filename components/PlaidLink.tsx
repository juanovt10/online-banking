import React, { useCallback, useEffect, useState } from 'react'
import { PlaidLinkOnSuccess, PlaidLinkOptions, usePlaidLink } from 'react-plaid-link'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation';
import { createLinkToken, exchangePublicToken } from '@/lib/actions/user.actions';

const PlaidLink = ({ user, variant }: PlaidLinkProps) => {

  // initiate router
  const router = useRouter();

  // set token initial state
  const [token, setToken] = useState('');

  useEffect(() => {
    const getLinkToken = async () => {
      // get the data from the createLinkToken method
      // created in actions

      const data = await createLinkToken(user);

      // set the token state
      setToken(data?.linkToken)
    }

    getLinkToken();
  }, [user])

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken: string) => {
    await exchangePublicToken({
      publicToken: publicToken,
      user,
    });

    router.push('/');

  }, [user])


  // set configuration containing the token and the onSuccess method
  const config: PlaidLinkOptions = {
    token,
    onSuccess
  }

  // usePlaidLink hook destructured
  const { open, ready } = usePlaidLink(config);

  return (
    <>
      {variant === 'primary' ? (
        <Button 
          className='plaidlink-primary'
          onClick={() => open()}
          disabled={!ready}
        >
          Connect bank
        </Button>
      ) : variant === 'ghost' ? (
        <Button>
          Connect bank
        </Button>
      ) : (
        <Button>
          Connect bank
        </Button>
      )}
    </>
  )
}

export default PlaidLink