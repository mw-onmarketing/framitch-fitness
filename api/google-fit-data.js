module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accessToken, dataType, startTime, endTime } = req.body || {};

  if (!accessToken) return res.status(400).json({ error: 'No access token provided' });
  if (!dataType) return res.status(400).json({ error: 'No data type specified' });
  if (!startTime || !endTime) return res.status(400).json({ error: 'Missing time range' });

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  try {
    if (dataType === 'steps') {
      // Use Google Fit Aggregate API for step count
      const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          aggregateBy: [{
            dataTypeName: 'com.google.step_count.delta',
            dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas'
          }],
          bucketByTime: { durationMillis: endTime - startTime },
          startTimeMillis: startTime,
          endTimeMillis: endTime
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Fit steps API error:', response.status, errorText);
        return res.status(500).json({ error: 'Steps fetch failed', message: `Status ${response.status}` });
      }

      const data = await response.json();

      // Extract total steps from buckets
      let totalSteps = 0;
      if (data.bucket) {
        data.bucket.forEach(bucket => {
          if (bucket.dataset) {
            bucket.dataset.forEach(ds => {
              if (ds.point) {
                ds.point.forEach(point => {
                  if (point.value) {
                    point.value.forEach(val => {
                      totalSteps += val.intVal || 0;
                    });
                  }
                });
              }
            });
          }
        });
      }

      return res.status(200).json({ steps: totalSteps });
    }

    if (dataType === 'weight') {
      // Use Google Fit Data Sources API for weight
      const datasetId = `${startTime * 1000000}-${endTime * 1000000}`;
      const response = await fetch(
        `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/${datasetId}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Fit weight API error:', response.status, errorText);
        return res.status(500).json({ error: 'Weight fetch failed', message: `Status ${response.status}` });
      }

      const data = await response.json();

      // Get the most recent weight entry
      let latestWeight = 0;
      let latestTime = 0;

      if (data.point) {
        data.point.forEach(point => {
          const pointTime = parseInt(point.startTimeNanos) || 0;
          if (point.value && point.value.length > 0 && pointTime > latestTime) {
            const fpVal = point.value[0].fpVal;
            if (fpVal && fpVal > 0) {
              latestWeight = fpVal;
              latestTime = pointTime;
            }
          }
        });
      }

      return res.status(200).json({ weight: latestWeight });
    }

    return res.status(400).json({ error: 'Invalid data type. Use "steps" or "weight".' });
  } catch (error) {
    console.error('Google Fit data error:', error);
    return res.status(500).json({ error: 'Data fetch failed', message: error.message });
  }
};
