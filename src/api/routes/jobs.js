import * as db from '../../storage/database.js';

export async function jobsRoutes(app, { config }) {
  app.get('/jobs/:id', async (request, reply) => {
    const job = db.getJob(request.params.id);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    return formatJobResponse(job, config);
  });

  app.get('/jobs', async (request, reply) => {
    const { status, type, limit, offset } = request.query;
    const jobs = db.listJobs({
      status,
      type,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return {
      jobs: jobs.map(j => formatJobResponse(j, config)),
      count: jobs.length,
    };
  });
}

function formatJobResponse(job, config) {
  const response = {
    id: job.id,
    type: job.type,
    status: job.status,
    prompt: job.prompt,
    parameters: job.parameters,
    parent_job_id: job.parent_job_id,
    progress: job.progress,
    error: job.error,
    result: job.result,
    image_url: job.local_image_path
      ? `${config.api.base_url || ''}/images/${job.local_image_path}`
      : job.image_url,
    created_at: job.created_at,
    updated_at: job.updated_at,
    completed_at: job.completed_at,
  };
  return response;
}
