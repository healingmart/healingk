const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const region = req.query.region || '서울';
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      // API 키가 없을 때의 폴백 (20도)
      return res.json({
        success: true,
        data: { region, temperature: 20, sky: '맑음', message: 'API 키 설정 필요', time: new Date().toLocaleString('ko-KR') }
      });
    }

    const coordinates = { '서울': {nx:60, ny:127}, '부산': {nx:98, ny:76}, '제주': {nx:52, ny:38} };
    const coord = coordinates[region] || coordinates['서울'];

    const now = new Date();
    // KST로 변환
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));

    // 기상청 발표 시각 계산 (가장 가까운 과거 발표 시각)
    // 발표 시각: 02, 05, 08, 11, 14, 17, 20, 23시
    const currentHour = kst.getHours();
    let baseTime;
    if (currentHour >= 23) baseTime = '2300';
    else if (currentHour >= 20) baseTime = '2000';
    else if (currentHour >= 17) baseTime = '1700';
    else if (currentHour >= 14) baseTime = '1400';
    else if (currentHour >= 11) baseTime = '1100';
    else if (currentHour >= 8) baseTime = '0800';
    else if (currentHour >= 5) baseTime = '0500';
    else baseTime = '0200'; // 00시, 01시 등은 전날 23시 또는 02시 기준
    
    // 만약 현재 시각이 00시, 01시이고 baseTime이 0200으로 설정된다면, baseDate는 전날이어야 함
    let baseDate = kst.toISOString().slice(0,10).replace(/-/g, '');
    if (currentHour < 2 && baseTime === '2300') { // 00시, 01시인데 전날 23시 예보를 가져오는 경우
        const yesterday = new Date(kst.getTime() - (24 * 60 * 60 * 1000));
        baseDate = yesterday.toISOString().slice(0,10).replace(/-/g, '');
    }
    // 예외: 자정(00시)부터 02시 이전까지는 전날 23시 데이터로 가져오고, baseDate도 전날로
    if (currentHour < 2 && baseTime === '0200' && kst.getHours() < 2) { // 00시, 01시 상황
        const yesterday = new Date(kst.getTime() - (24 * 60 * 60 * 1000));
        baseDate = yesterday.toISOString().slice(0,10).replace(/-/g, '');
        baseTime = '2300'; // 전날 23시 데이터
    }

    console.log(`Fetching weather for base_date: ${baseDate}, base_time: ${baseTime}`); // 디버깅용

    const response = await axios.get('http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst', {
      params: {
        serviceKey: apiKey,
        numOfRows: 100,
        pageNo: 1,
        dataType: 'JSON',
        base_date: baseDate,
        base_time: baseTime,
        nx: coord.nx,
        ny: coord.ny
      },
      timeout: 8000
    });

    if (!response.data || !response.data.response || response.data.response.header.resultCode !== '00') {
      throw new Error(response.data?.response?.header?.resultMsg || 'API 응답 오류');
    }

    const items = response.data.response.body?.items?.item || [];
    let temperature = null; // 초기값을 null로 설정하여 데이터가 없으면 '정보 없음'을 명확히 함
    let sky = null;
    let precipitation = '없음'; // 강수량은 기상청 API에서 따로 PARS 하는 로직 추가 필요 (POP, PTY 등)

    // 현재 시각에 가장 가까운 예보 데이터를 찾기
    // KST 기준 현재 시각을 'HHMM' 포맷으로
    const currentFcstTime = String(kst.getHours()).padStart(2, '0') + String(kst.getMinutes()).padStart(2, '0');

    let closestTempItem = null;
    let closestSkyItem = null;
    let minTimeDiff = Infinity;

    items.forEach(item => {
        // 'fcstTime'은 예보 시각 (HHMM)
        // 'fcstValue'는 예보 값
        const fcstHour = parseInt(item.fcstTime.substring(0, 2), 10);
        const fcstMinute = parseInt(item.fcstTime.substring(2, 4), 10);
        const forecastDateTime = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate(), fcstHour, fcstMinute);
        
        // 현재 시각과의 차이 계산 (절대값)
        const timeDiff = Math.abs(kst.getTime() - forecastDateTime.getTime());

        if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            // 가장 가까운 시간대의 TMP와 SKY 값을 찾음
            // 주의: 실제 KMA API는 TMP, SKY 외에 POP, PTY 등 다른 값도 제공하므로,
            // 같은 fcstTime에 여러 category가 있을 수 있음.
            // 여기서는 가장 가까운 fcstTime의 TMP와 SKY를 '우선'으로 가져오는 방식.
            // 더 정교하게 하려면 fcstTime 기준으로 그룹화하여 처리하는 것이 좋음.
        }

        // 현재 예보 시각 이후의 첫 번째 값을 가져오거나, 가장 가까운 시간대의 값을 가져오도록 로직 보완 필요
        // 여기서는 가장 가까운 시간을 찾는 것보다는, 현재 시각 또는 다음 예보 시각의 값을 가져오는 것이 더 실용적일 수 있음.

        // 단순화된 예시: TMP와 SKY를 파싱하되, 어떤 fcstTime의 값인지는 별도로 처리해야 함
        if (item.category === 'TMP') {
            // 이 예시에서는 마지막 TMP 값을 사용하므로, 실제 '현재' 온도가 아닐 수 있음.
            // 특정 fcstTime (예: 요청 시각에 가장 가까운 다음 정시)의 TMP 값을 찾아야 함.
            temperature = parseFloat(item.fcstValue);
        }
        if (item.category === 'SKY') {
            sky = item.fcstValue === '1' ? '맑음' : item.fcstValue === '3' ? '구름많음' : '흐림';
        }
        // 강수 형태(PTY)와 강수 확률(POP) 등을 사용하여 precipitation 정의 필요
        // 예: if (item.category === 'PTY') precipitation = item.fcstValue === '0' ? '없음' : '비/눈';
        // (PTY 값에 대한 상세 해석 필요)
    });

    // --- 여기부터는 `items` 배열을 순회하여 현재 시각에 가장 적합한 TMP와 SKY를 찾는 로직이 들어가야 합니다. ---
    // 아래 코드는 `items.forEach` 루프가 끝난 후, `temperature`와 `sky`에 마지막으로 할당된 값이 들어있을 뿐입니다.
    // 현재 시각 `kst`와 `item.fcstTime`을 비교하여 가장 적합한 값을 선택해야 합니다.

    let currentForecastTemperature = null;
    let currentForecastSky = null;
    let currentForecastTime = null; // 실제 예보 시각을 저장할 변수

    // KMA API의 예보 시간 기준은 발표 시각(base_time)으로부터 1시간 후부터 3시간 간격으로 나옴.
    // 예를 들어 0500 발표는 0600, 0900, 1200... 예보를 포함.
    // 현재 시각 kst에 가장 가까운, 또는 그 다음 fcstTime의 데이터를 가져오는 로직 필요
    const targetHour = kst.getHours();
    const targetMinute = kst.getMinutes();

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const fcstHour = parseInt(item.fcstTime.substring(0, 2), 10);
        const fcstMinute = parseInt(item.fcstTime.substring(2, 4), 10);

        // 현재 시각과 비교하여, 다음 예보 시각의 데이터를 우선적으로 선택
        // (예: 현재 08:30이면 09:00 예보를 찾음)
        // fcstTime이 현재 시각보다 같거나 큰 가장 첫 번째 값을 찾으면 됨
        if (fcstHour > targetHour || (fcstHour === targetHour && fcstMinute >= targetMinute)) {
            // 해당 예보 시간대의 모든 카테고리 확인
            // 동일한 fcstTime을 가진 item들이 묶여서 나올 수 있으므로, 해당 fcstTime에 맞는 값을 찾음
            let foundTempForFcstTime = false;
            let foundSkyForFcstTime = false;
            
            // 해당 fcstTime에 해당하는 모든 아이템을 확인
            for (let j = i; j < items.length; j++) {
                const innerItem = items[j];
                if (innerItem.fcstTime !== item.fcstTime) { // 예보 시각이 달라지면 중단
                    break;
                }

                if (innerItem.category === 'TMP' && currentForecastTemperature === null) {
                    currentForecastTemperature = parseFloat(innerItem.fcstValue);
                    foundTempForFcstTime = true;
                }
                if (innerItem.category === 'SKY' && currentForecastSky === null) {
                    currentForecastSky = innerItem.fcstValue === '1' ? '맑음' : innerItem.fcstValue === '3' ? '구름많음' : '흐림';
                    foundSkyForFcstTime = true;
                }
                // 다른 필요한 카테고리 (POP, PTY 등)도 여기서 찾을 수 있음

                if (foundTempForFcstTime && foundSkyForFcstTime) {
                    currentForecastTime = item.fcstTime; // 이 예보 데이터의 실제 시각
                    break; // 원하는 카테고리를 모두 찾았으므로 더 이상 찾지 않음
                }
            }
            if (currentForecastTemperature !== null && currentForecastSky !== null) {
                break; // 가장 적합한 예보 데이터를 찾았으므로 전체 루프 중단
            }
        }
    }

    // 만약 현재 이후 예보가 없다면 (하루 중 마지막 예보 시점 이후), 가장 마지막 예보 데이터를 사용
    if (currentForecastTemperature === null && items.length > 0) {
        // 배열을 역순으로 돌면서 마지막 예보 데이터 찾기 (좀 더 정확한 방법 필요)
        for (let i = items.length -1; i >= 0; i--) {
            const item = items[i];
            if (item.category === 'TMP' && currentForecastTemperature === null) {
                currentForecastTemperature = parseFloat(item.fcstValue);
            }
            if (item.category === 'SKY' && currentForecastSky === null) {
                currentForecastSky = item.fcstValue === '1' ? '맑음' : item.fcstValue === '3' ? '구름많음' : '흐림';
            }
            if (item.fcstTime && currentForecastTime === null) { // 가장 마지막 fcstTime 저장
                currentForecastTime = item.fcstTime;
            }
            if (currentForecastTemperature !== null && currentForecastSky !== null && currentForecastTime !== null) {
                break;
            }
        }
    }

    return res.json({
      success: true,
      data: {
        region,
        temperature: currentForecastTemperature !== null ? currentForecastTemperature : 20, // 가져온 값이 없으면 기본 20
        sky: currentForecastSky !== null ? currentForecastSky : '맑음', // 가져온 값이 없으면 기본 '맑음'
        precipitation: precipitation, // 강수량 로직은 아직 불완전
        message: `🌟 기상청 ${baseDate.slice(4,6)}월${baseDate.slice(6,8)}일 ${baseTime.slice(0,2)}시 발표 예보`, // 메시지 변경
        time: currentForecastTime ? `${currentForecastTime.slice(0,2)}시 ${currentForecastTime.slice(2,4)}분 예보` : new Date().toLocaleString('ko-KR') // 예보 시간 또는 현재 요청 시간
      }
    });

  } catch (error) {
    console.error("Backend API Error:", error.message); // 서버 로그에 자세한 오류 기록
    return res.json({
      success: false, // 오류 발생 시 success: false로 변경하는 것이 더 적절
      message: `⚠️ 오류: ${error.message}. API 키나 서비스 상태를 확인하세요.`,
      data: { // 오류 발생 시에도 기본 데이터는 제공하지만, 사용자에게 오류임을 알림
        region: req.query.region || '서울',
        temperature: 20,
        sky: '맑음',
        precipitation: '정보 없음',
        time: new Date().toLocaleString('ko-KR')
      }
    });
  }
};
