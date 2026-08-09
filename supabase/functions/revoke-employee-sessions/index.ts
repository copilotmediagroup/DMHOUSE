import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/json',
      },
    },
  );
}

Deno.serve(
  async (req) => {
    if (
      req.method ===
      'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          headers:
            corsHeaders,
        },
      );
    }


    if (
      req.method !==
      'POST'
    ) {
      return json(
        {
          error:
            'Method not allowed.',
        },
        405,
      );
    }


    const supabaseUrl =
      Deno.env.get(
        'SUPABASE_URL',
      );

    const anonKey =
      Deno.env.get(
        'SUPABASE_ANON_KEY',
      );

    const serviceRoleKey =
      Deno.env.get(
        'SUPABASE_SERVICE_ROLE_KEY',
      );


    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      return json(
        {
          error:
            'Supabase environment is incomplete.',
        },
        500,
      );
    }


    const authorization =
      req.headers.get(
        'Authorization',
      );


    if (!authorization) {
      return json(
        {
          error:
            'Authentication required.',
        },
        401,
      );
    }


    /*
      USER-SCOPED CLIENT

      Used only to establish
      who is calling.
    */
    const userClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                authorization,
            },
          },

          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        },
      );


    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await userClient
        .auth
        .getUser();


    if (
      userError ||
      !user
    ) {
      return json(
        {
          error:
            'Authenticated Owner session required.',
        },
        401,
      );
    }


    /*
      ADMIN CLIENT

      Service-role key never
      leaves this Edge Function.
    */
    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        },
      );


    let body:
      {
        employeeId?: string;
        action?:
          | 'suspend'
          | 'terminate';
      };


    try {
      body =
        await req.json();
    } catch {
      return json(
        {
          error:
            'Invalid request body.',
        },
        400,
      );
    }


    const employeeId =
      String(
        body.employeeId ||
          '',
      ).trim();


    const action =
      body.action;


    if (!employeeId) {
      return json(
        {
          error:
            'employeeId is required.',
        },
        400,
      );
    }


    if (
      action !==
        'suspend' &&
      action !==
        'terminate'
    ) {
      return json(
        {
          error:
            'action must be suspend or terminate.',
        },
        400,
      );
    }


    /*
      VERIFY CALLER PROFILE
    */
    const {
      data:
        ownerProfile,
      error:
        ownerError,
    } =
      await admin
        .from(
          'profiles',
        )
        .select(
          'id,company_id,role,is_active',
        )
        .eq(
          'id',
          user.id,
        )
        .maybeSingle();


    if (
      ownerError ||
      !ownerProfile ||
      ownerProfile.role !==
        'owner' ||
      !ownerProfile.is_active
    ) {
      return json(
        {
          error:
            'Owner authorization required.',
        },
        403,
      );
    }


    /*
      VERIFY TARGET EMPLOYEE
      BELONGS TO SAME COMPANY.
    */
    const {
      data:
        employeeProfile,
      error:
        employeeError,
    } =
      await admin
        .from(
          'profiles',
        )
        .select(
          'id,company_id,role,is_active',
        )
        .eq(
          'id',
          employeeId,
        )
        .eq(
          'company_id',
          ownerProfile.company_id,
        )
        .eq(
          'role',
          'employee',
        )
        .maybeSingle();


    if (
      employeeError ||
      !employeeProfile
    ) {
      return json(
        {
          error:
            'Employee not found in Owner company.',
        },
        404,
      );
    }


    /*
      VERIFY EMPLOYMENT STATE.

      Revocation is allowed only AFTER
      database employment state has
      already been changed by the
      employment RPC.

      This prevents this endpoint from
      becoming a generic "log out anybody"
      mechanism.
    */
    const {
      data:
        employment,
      error:
        employmentError,
    } =
      await admin
        .from(
          'employee_employment_state',
        )
        .select(
          'status',
        )
        .eq(
          'employee_id',
          employeeId,
        )
        .maybeSingle();


    if (
      employmentError ||
      !employment
    ) {
      return json(
        {
          error:
            'Employment state not found.',
        },
        409,
      );
    }


    const expectedStatus =
      action ===
        'terminate'
        ? 'terminated'
        : 'suspended';


    if (
      employment.status !==
      expectedStatus
    ) {
      return json(
        {
          error:
            `Employment state must be ${expectedStatus} before session revocation.`,
        },
        409,
      );
    }


    /*
      GLOBAL SESSION REVOCATION

      Supabase Admin Auth uses the
      employee's user id to terminate
      that user's sessions.

      Refresh tokens are invalidated
      across browsers/devices.

      Existing access JWTs may remain
      cryptographically valid until
      expiry, which is why DMHOUSE also
      enforces:
        - profile.is_active
        - employment state
        - realtime lockout
        - periodic access verification
    */
    const {
      error:
        signOutError,
    } =
      await admin.auth.admin.signOut(
        employeeId,
        'global',
      );


    if (signOutError) {
      console.error(
        'Global employee sign-out failed:',
        signOutError,
      );

      return json(
        {
          error:
            signOutError.message,
        },
        500,
      );
    }


    /*
      AUDIT THE SECURITY ACTION
    */
    const {
      error:
        auditError,
    } =
      await admin
        .from(
          'employee_employment_events',
        )
        .insert({
          employee_id:
            employeeId,

          company_id:
            ownerProfile.company_id,

          actor_id:
            user.id,

          event_type:
            action ===
              'terminate'
              ? 'employee.terminated'
              : 'employee.suspended',

          reason:
            'Global Supabase Auth sessions revoked.',

          metadata: {
            securityEvent:
              'global_session_revocation',

            scope:
              'global',

            source:
              'revoke-employee-sessions',

            action,
          },
        });


    /*
      The employment event itself was
      already created by the employment
      RPC.

      If this secondary audit insert
      conflicts with event constraints or
      fails for another non-auth reason,
      session revocation itself must still
      remain successful.
    */
    if (auditError) {
      console.error(
        'Session revocation audit write failed:',
        auditError,
      );
    }


    return json({
      ok: true,

      employeeId,

      action,

      employmentStatus:
        employment.status,

      sessionsRevoked:
        true,
    });
  },
);
