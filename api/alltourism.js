// api/tourism-v4.js - 완벽한 TourAPI 4.0 통합 서버리스 백엔드 v4.3
import {
  SUPPORTED_OPERATIONS,
  ALLOWED_ORIGINS,
  validateSecurityHeaders,
  fetchWithRetry,
  validateApiResponse,
  extractItems,
  extractSingleItem,
  processBasicItem,
  processBasicItems,
  addDetailedInfo,
  processDetailIntroItem,
  processDetailInfoItem,
  calculateCompleteness,
  getContentTypeName,
  getCategoryInfo,
  getAreaInfo,
  ApiError,
  ValidationError,
  SecurityError
} from '../utils/tourism-utils.js';

/**
 * TourAPI 4.0 서버리스 백엔드 메인 핸들러
 * @param {Object} req - 요청 객체
 * @param {Object} res - 응답 객체
 * @returns {Object} API 응답
 */
export default async function handler(req, res) {
  // **보안 검증**
  try {
    validateSecurityHeaders(req, ALLOWED_ORIGINS);
  } catch (error) {
    console.warn('🔒 보안 검증 실패:', error.message);
    return res.status(403).json({
      success: false,
      message: '접근이 거부되었습니다',
      code: 'ACCESS_DENIED',
      timestamp: new Date().toISOString()
    });
  }

  // **CORS 설정**
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { operation = 'search', ...params } = req.method === 'GET' ? req.query : req.body;

    // **API 키 검증**
    const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: 'API 키가 설정되지 않았습니다',
        code: 'MISSING_API_KEY',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🚀 TourAPI 요청: ${operation}`, {
      params: Object.keys(params),
      timestamp: new Date().toISOString(),
      origin: req.headers.origin || 'unknown'
    });

    const startTime = Date.now();
    let result;

    // **오퍼레이션별 라우팅**
    switch (operation) {
      // 검색 관련
      case 'search':
      case 'areaBasedList':
        result = await handleAreaBasedSearch(apiKey, params);
        break;
      case 'locationBasedList':
        result = await handleLocationBasedSearch(apiKey, params);
        break;
      case 'searchKeyword':
        result = await handleKeywordSearch(apiKey, params);
        break;
      case 'searchFestival':
        result = await handleFestivalSearch(apiKey, params);
        break;
      case 'searchStay':
        result = await handleStaySearch(apiKey, params);
        break;

      // 상세정보 관련
      case 'detailCommon':
        result = await handleDetailCommon(apiKey, params);
        break;
      case 'detailIntro':
        result = await handleDetailIntro(apiKey, params);
        break;
      case 'detailInfo':
        result = await handleDetailInfo(apiKey, params);
        break;
      case 'detailImage':
        result = await handleDetailImage(apiKey, params);
        break;
      case 'detailPetTour':
        result = await handleDetailPetTour(apiKey, params);
        break;

      // 코드 관련
      case 'areaCode':
        result = await handleAreaCode(apiKey, params);
        break;
      case 'categoryCode':
        result = await handleCategoryCode(apiKey, params);
        break;
      case 'ldongCode':
        result = await handleLdongCode(apiKey, params);
        break;
      case 'lclsSystmCode':
        result = await handleLclsSystmCode(apiKey, params);
        break;

      // 기타
      case 'areaBasedSyncList':
        result = await handleAreaBasedSyncList(apiKey, params);
        break;
      case 'getAllData':
        result = await handleGetAllData(apiKey, params);
        break;

      default:
        return res.status(400).json({
          success: false,
          message: `지원하지 않는 오퍼레이션: ${operation}`,
          supportedOperations: SUPPORTED_OPERATIONS,
          code: 'UNSUPPORTED_OPERATION',
          timestamp: new Date().toISOString()
        });
    }

    const totalTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      operation,
      data: result.data,
      metadata: {
        ...result.metadata,
        performance: {
          ...result.metadata?.performance,
          totalTime,
          timestamp: new Date().toISOString()
        },
        version: '4.3.0',
        apiVersion: 'TourAPI 4.0'
      }
    });

  } catch (error) {
    console.error('🚨 TourAPI 오류:', error);
    
    return res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      message: error.message,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      operation: req.query.operation || req.body?.operation,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// **지역기반 관광정보 조회** (매뉴얼 p.22 기준)
async function handleAreaBasedSearch(apiKey, params) {
  const {
    numOfRows = '10',
    pageNo = '1',
    arrange = 'C',
    contentTypeId = '',
    areaCode = '',
    sigunguCode = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    modifiedtime = '',
    lDongRegnCd = '',
    lDongSignguCd = '',
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    detailed = 'false',
    includeImages = 'false',
    userLat = '',
    userLng = '',
    radius = ''
  } = params;

  const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
  let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}`;

  // 매뉴얼 v4.3 기준 파라미터 추가
  if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
  if (areaCode) url += `&areaCode=${areaCode}`;
  if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;
  if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
  if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'areaBasedList');

  const items = extractItems(data);
  let processedItems = await processBasicItems(items, userLat, userLng, radius);

  // 상세 정보 추가
  if (detailed === 'true' && processedItems.length > 0) {
    processedItems = await addDetailedInfo(apiKey, processedItems, {
      includeImages: includeImages === 'true',
      maxItems: Math.min(processedItems.length, 10)
    });
  }

  return {
    data: {
      items: processedItems,
      pagination: {
        totalCount: data.response?.body?.totalCount || processedItems.length,
        pageNo: parseInt(pageNo),
        numOfRows: parseInt(numOfRows),
        hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
      }
    },
    metadata: {
      operation: 'areaBasedList',
      searchParams: params,
      performance: {
        searchTime,
        itemCount: processedItems.length,
        detailedCount: processedItems.filter(item => item.detailed).length
      }
    }
  };
}

// **위치기반 관광정보 조회** (매뉴얼 p.27 기준)
async function handleLocationBasedSearch(apiKey, params) {
  const {
    numOfRows = '10',
    pageNo = '1',
    arrange = 'E', // 거리순 기본
    contentTypeId = '',
    mapX, // 필수
    mapY, // 필수
    radius, // 필수
    areaCode = '',
    sigunguCode = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    modifiedtime = '',
    lDongRegnCd = '',
    lDongSignguCd = '',
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    detailed = 'false',
    includeImages = 'false'
  } = params;

  // 필수 파라미터 검증
  if (!mapX || !mapY || !radius) {
    throw new ValidationError('위치기반 검색에는 mapX, mapY, radius가 필수입니다');
  }

  const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2';
  let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&mapX=${mapX}&mapY=${mapY}&radius=${radius}`;

  if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
  if (areaCode) url += `&areaCode=${areaCode}`;
  if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;
  if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
  if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'locationBasedList');

  const items = extractItems(data);
  let processedItems = items.map(item => ({
    ...processBasicItem(item),
    dist: parseFloat(item.dist) || null // API에서 제공하는 거리 정보
  }));

  // 상세 정보 추가
  if (detailed === 'true' && processedItems.length > 0) {
    processedItems = await addDetailedInfo(apiKey, processedItems, {
      includeImages: includeImages === 'true',
      maxItems: Math.min(processedItems.length, 10)
    });
  }

  return {
    data: {
      items: processedItems,
      pagination: {
        totalCount: data.response?.body?.totalCount || processedItems.length,
        pageNo: parseInt(pageNo),
        numOfRows: parseInt(numOfRows),
        hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
      },
      searchCenter: {
        lat: parseFloat(mapY),
        lng: parseFloat(mapX),
        radius: parseFloat(radius)
      }
    },
    metadata: {
      operation: 'locationBasedList',
      searchParams: params,
      performance: {
        searchTime,
        itemCount: processedItems.length
      }
    }
  };
}

// **키워드 검색 조회** (매뉴얼 p.31 기준)
async function handleKeywordSearch(apiKey, params) {
  const {
    numOfRows = '10',
    pageNo = '1',
    arrange = 'C',
    keyword, // 필수
    areaCode = '',
    sigunguCode = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    lDongRegnCd = '',
    lDongSignguCd = '',
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    detailed = 'false',
    includeImages = 'false',
    userLat = '',
    userLng = '',
    radius = ''
  } = params;

  if (!keyword || keyword.trim() === '') {
    throw new ValidationError('키워드 검색에는 keyword가 필수입니다');
  }

  const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2';
  let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&keyword=${encodeURIComponent(keyword)}`;

  if (areaCode) url += `&areaCode=${areaCode}`;
  if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;
  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
  if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'searchKeyword');

  const items = extractItems(data);
  let processedItems = await processBasicItems(items, userLat, userLng, radius);

  // 상세 정보 추가
  if (detailed === 'true' && processedItems.length > 0) {
    processedItems = await addDetailedInfo(apiKey, processedItems, {
      includeImages: includeImages === 'true',
      maxItems: Math.min(processedItems.length, 10)
    });
  }

  return {
    data: {
      items: processedItems,
      pagination: {
        totalCount: data.response?.body?.totalCount || processedItems.length,
        pageNo: parseInt(pageNo),
        numOfRows: parseInt(numOfRows),
        hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
      },
      searchKeyword: keyword
    },
    metadata: {
      operation: 'searchKeyword',
      searchParams: params,
      performance: {
        searchTime,
        itemCount: processedItems.length
      }
    }
  };
}

// **행사정보 조회** (매뉴얼 p.34 기준)
async function handleFestivalSearch(apiKey, params) {
  const {
    numOfRows = '10',
    pageNo = '1',
    arrange = 'C',
    eventStartDate, // 필수
    eventEndDate = '',
    areaCode = '',
    sigunguCode = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    modifiedtime = '',
    lDongRegnCd = '',
    lDongSignguCd = '',
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    detailed = 'false',
    includeImages = 'false'
  } = params;

  if (!eventStartDate) {
    throw new ValidationError('행사정보 조회에는 eventStartDate가 필수입니다');
  }

  const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
  let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&eventStartDate=${eventStartDate}`;

  if (eventEndDate) url += `&eventEndDate=${eventEndDate}`;
  if (areaCode) url += `&areaCode=${areaCode}`;
  if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;
  if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
  if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'searchFestival');

  const items = extractItems(data);
  let processedItems = items.map(item => ({
    ...processBasicItem(item),
    eventstartdate: item.eventstartdate,
    eventenddate: item.eventenddate,
    progresstype: item.progresstype || null,
    festivaltype: item.festivaltype || null
  }));

  // 상세 정보 추가
  if (detailed === 'true' && processedItems.length > 0) {
    processedItems = await addDetailedInfo(apiKey, processedItems, {
      includeImages: includeImages === 'true',
      maxItems: Math.min(processedItems.length, 10)
    });
  }

  return {
    data: {
      items: processedItems,
      pagination: {
        totalCount: data.response?.body?.totalCount || processedItems.length,
        pageNo: parseInt(pageNo),
        numOfRows: parseInt(numOfRows),
        hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
      },
      eventPeriod: {
        startDate: eventStartDate,
        endDate: eventEndDate || null
      }
    },
    metadata: {
      operation: 'searchFestival',
      searchParams: params,
      performance: {
        searchTime,
        itemCount: processedItems.length
      }
    }
  };
}

// **숙박정보 조회** (매뉴얼 p.38 기준)
async function handleStaySearch(apiKey, params) {
  const {
    numOfRows = '10',
    pageNo = '1',
    arrange = 'C',
    areaCode = '',
    sigunguCode = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    modifiedtime = '',
    lDongRegnCd = '',
    lDongSignguCd = '',
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    detailed = 'false',
    includeImages = 'false'
  } = params;

  const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/searchStay2';
  let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}`;

  if (areaCode) url += `&areaCode=${areaCode}`;
  if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;
  if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
  if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'searchStay');

  const items = extractItems(data);
  let processedItems = items.map(item => processBasicItem(item));

  // 상세 정보 추가
  if (detailed === 'true' && processedItems.length > 0) {
    processedItems = await addDetailedInfo(apiKey, processedItems, {
      includeImages: includeImages === 'true',
      maxItems: Math.min(processedItems.length, 10)
    });
  }

  return {
    data: {
      items: processedItems,
      pagination: {
        totalCount: data.response?.body?.totalCount || processedItems.length,
        pageNo: parseInt(pageNo),
        numOfRows: parseInt(numOfRows),
        hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
      }
    },
    metadata: {
      operation: 'searchStay',
      searchParams: params,
      performance: {
        searchTime,
        itemCount: processedItems.length
      }
    }
  };
}

// **공통정보 조회** (매뉴얼 p.42 기준)
async function handleDetailCommon(apiKey, params) {
  const { contentId } = params;

  if (!contentId) {
    throw new ValidationError('공통정보 조회에는 contentId가 필수입니다');
  }

  const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'detailCommon');

  const item = extractSingleItem(data);
  const processedItem = {
    contentId: item.contentid,
    contentTypeId: item.contenttypeid,
    title: item.title,
    createdtime: item.createdtime,
    modifiedtime: item.modifiedtime,
    tel: item.tel || null,
    telname: item.telname || null,
    homepage: item.homepage?.replace(/<[^>]*>/g, '') || null,
    firstimage: item.firstimage || null,
    firstimage2: item.firstimage2 || null,
    cpyrhtDivCd: item.cpyrhtDivCd || null,
    areacode: item.areacode,
    sigungucode: item.sigungucode,
    cat1: item.cat1,
    cat2: item.cat2,
    cat3: item.cat3,
    addr1: item.addr1,
    addr2: item.addr2 || null,
    zipcode: item.zipcode || null,
    mapx: parseFloat(item.mapx) || null,
    mapy: parseFloat(item.mapy) || null,
    mlevel: item.mlevel || null,
    overview: item.overview || null,
    // v4.3 신규 필드
    lDongRegnCd: item.lDongRegnCd || null,
    lDongSignguCd: item.lDongSignguCd || null,
    lclsSystm1: item.lclsSystm1 || null,
    lclsSystm2: item.lclsSystm2 || null,
    lclsSystm3: item.lclsSystm3 || null
  };

  return {
    data: processedItem,
    metadata: {
      operation: 'detailCommon',
      contentId,
      performance: { searchTime }
    }
  };
}

// **소개정보 조회** (매뉴얼 p.47 기준)
async function handleDetailIntro(apiKey, params) {
  const { contentId, contentTypeId } = params;

  if (!contentId || !contentTypeId) {
    throw new ValidationError('소개정보 조회에는 contentId와 contentTypeId가 필수입니다');
  }

  const url = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'detailIntro');

  const item = extractSingleItem(data);
  const processedItem = processDetailIntroItem(contentTypeId, item);

  return {
    data: processedItem,
    metadata: {
      operation: 'detailIntro',
      contentId,
      contentTypeId,
      typeName: getContentTypeName(contentTypeId),
      performance: { searchTime }
    }
  };
}

// **반복정보 조회** (매뉴얼 p.54 기준)
async function handleDetailInfo(apiKey, params) {
  const { contentId, contentTypeId } = params;

  if (!contentId || !contentTypeId) {
    throw new ValidationError('반복정보 조회에는 contentId와 contentTypeId가 필수입니다');
  }

  const url = `https://apis.data.go.kr/B551011/KorService2/detailInfo2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'detailInfo');

  const items = extractItems(data);
  const processedItems = items.map(item => processDetailInfoItem(contentTypeId, item));

  return {
    data: processedItems,
    metadata: {
      operation: 'detailInfo',
      contentId,
      contentTypeId,
      typeName: getContentTypeName(contentTypeId),
      itemCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **이미지정보 조회** (매뉴얼 p.61 기준)
async function handleDetailImage(apiKey, params) {
  const { contentId, imageYN = 'Y' } = params;

  if (!contentId) {
    throw new ValidationError('이미지정보 조회에는 contentId가 필수입니다');
  }

  const url = `https://apis.data.go.kr/B551011/KorService2/detailImage2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&imageYN=${imageYN}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'detailImage');

  const items = extractItems(data);
  const processedItems = items.map(item => ({
    contentId: item.contentid,
    originimgurl: item.originimgurl,
    smallimageurl: item.smallimageurl,
    cpyrhtDivCd: item.cpyrhtDivCd || null,
    imgname: item.imgname || null,
    serialnum: item.serialnum || null
  }));

  return {
    data: processedItems,
    metadata: {
      operation: 'detailImage',
      contentId,
      imageYN,
      imageCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **반려동물 여행정보 조회** (v4.1 신규, 매뉴얼 p.69)
async function handleDetailPetTour(apiKey, params) {
  const { contentId = '' } = params;

  const url = `https://apis.data.go.kr/B551011/KorService2/detailPetTour2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json${contentId ? `&contentId=${contentId}` : ''}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'detailPetTour');

  const items = extractItems(data);
  const processedItems = items.map(item => ({
    contentId: item.contentid,
    petTursmInfo: item.petTursmInfo || null,
    relaAcdntRiskMtr: item.relaAcdntRiskMtr || null,
    acmpyTypeCd: item.acmpyTypeCd || null,
    relaPosesFclty: item.relaPosesFclty || null,
    relaFrnshPrdlst: item.relaFrnshPrdlst || null,
    etcAcmpyInfo: item.etcAcmpyInfo || null,
    relaPurcPrdlst: item.relaPurcPrdlst || null,
    acmpyPsblCpam: item.acmpyPsblCpam || null,
    relaRntlPrdlst: item.relaRntlPrdlst || null,
    acmpyNeedMtr: item.acmpyNeedMtr || null
  }));

  return {
    data: processedItems,
    metadata: {
      operation: 'detailPetTour',
      contentId: contentId || 'all',
      petInfoCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **지역코드 조회** (매뉴얼 p.12 기준)
async function handleAreaCode(apiKey, params) {
  const { areaCode = '', numOfRows = '100', pageNo = '1' } = params;

  const url = `https://apis.data.go.kr/B551011/KorService2/areaCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}${areaCode ? `&areaCode=${areaCode}` : ''}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'areaCode');

  const items = extractItems(data);
  const processedItems = items.map(item => ({
    code: item.code,
    name: item.name,
    rnum: item.rnum
  }));

  return {
    data: processedItems,
    metadata: {
      operation: 'areaCode',
      areaCode: areaCode || 'all',
      codeCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **서비스분류코드 조회** (매뉴얼 p.17 기준)
async function handleCategoryCode(apiKey, params) {
  const {
    contentTypeId = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    numOfRows = '100',
    pageNo = '1'
  } = params;

  let url = `https://apis.data.go.kr/B551011/KorService2/categoryCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}`;

  if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'categoryCode');

  const items = extractItems(data);
  const processedItems = items.map(item => ({
    code: item.code,
    name: item.name,
    rnum: item.rnum
  }));

  return {
    data: processedItems,
    metadata: {
      operation: 'categoryCode',
      searchParams: { contentTypeId, cat1, cat2, cat3 },
      codeCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **법정동코드 조회** (v4.3 신규, 매뉴얼 p.69)
async function handleLdongCode(apiKey, params) {
  const {
    lDongRegnCd = '',
    lDongListYn = 'N',
    numOfRows = '1000',
    pageNo = '1'
  } = params;

  let url = `https://apis.data.go.kr/B551011/KorService2/ldongCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&lDongListYn=${lDongListYn}`;

  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'ldongCode');

  const items = extractItems(data);
  const processedItems = items.map(item => {
    if (lDongListYn === 'Y') {
      return {
        lDongRegnCd: item.lDongRegnCd,
        lDongRegnNm: item.lDongRegnNm,
        lDongSignguCd: item.lDongSignguCd,
        lDongSignguNm: item.lDongSignguNm,
        rnum: item.rnum
      };
    } else {
      return {
        code: item.code,
        name: item.name,
        rnum: item.rnum
      };
    }
  });

  return {
    data: processedItems,
    metadata: {
      operation: 'ldongCode',
      lDongRegnCd: lDongRegnCd || 'all',
      listMode: lDongListYn === 'Y',
      codeCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **분류체계코드 조회** (v4.3 신규, 매뉴얼 p.69)
async function handleLclsSystmCode(apiKey, params) {
  const {
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    lclsSystmListYn = 'N',
    numOfRows = '1000',
    pageNo = '1'
  } = params;

  let url = `https://apis.data.go.kr/B551011/KorService2/lclsSystmCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&lclsSystmListYn=${lclsSystmListYn}`;

  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'lclsSystmCode');

  const items = extractItems(data);
  const processedItems = items.map(item => {
    if (lclsSystmListYn === 'Y') {
      return {
        lclsSystm1Cd: item.lclsSystm1Cd,
        lclsSystm1Nm: item.lclsSystm1Nm,
        lclsSystm2Cd: item.lclsSystm2Cd,
        lclsSystm2Nm: item.lclsSystm2Nm,
        lclsSystm3Cd: item.lclsSystm3Cd,
        lclsSystm3Nm: item.lclsSystm3Nm,
        rnum: item.rnum
      };
    } else {
      return {
        code: item.code,
        name: item.name,
        rnum: item.rnum
      };
    }
  });

  return {
    data: processedItems,
    metadata: {
      operation: 'lclsSystmCode',
      searchParams: { lclsSystm1, lclsSystm2, lclsSystm3 },
      listMode: lclsSystmListYn === 'Y',
      codeCount: processedItems.length,
      performance: { searchTime }
    }
  };
}

// **동기화 목록 조회** (매뉴얼 p.64 기준)
async function handleAreaBasedSyncList(apiKey, params) {
  const {
    numOfRows = '10',
    pageNo = '1',
    showflag = '1',
    modifiedtime = '',
    arrange = 'C',
    contentTypeId = '',
    areaCode = '',
    sigunguCode = '',
    cat1 = '',
    cat2 = '',
    cat3 = '',
    lDongRegnCd = '',
    lDongSignguCd = '',
    lclsSystm1 = '',
    lclsSystm2 = '',
    lclsSystm3 = '',
    oldContentid = ''
  } = params;

  let url = `https://apis.data.go.kr/B551011/KorService2/areaBasedSyncList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&showflag=${showflag}&arrange=${arrange}`;

  if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
  if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
  if (areaCode) url += `&areaCode=${areaCode}`;
  if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
  if (cat1) url += `&cat1=${cat1}`;
  if (cat2) url += `&cat2=${cat2}`;
  if (cat3) url += `&cat3=${cat3}`;
  if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
  if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
  if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
  if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
  if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;
  if (oldContentid) url += `&oldContentid=${oldContentid}`;

  const startTime = Date.now();
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const searchTime = Date.now() - startTime;

  validateApiResponse(data, 'areaBasedSyncList');

  const items = extractItems(data);
  const processedItems = items.map(item => ({
    ...processBasicItem(item),
    showflag: item.showflag,
    lDongRegnCd: item.lDongRegnCd || null,
    lDongSignguCd: item.lDongSignguCd || null,
    lclsSystm1: item.lclsSystm1 || null,
    lclsSystm2: item.lclsSystm2 || null,
    lclsSystm3: item.lclsSystm3 || null
  }));

  return {
    data: {
      items: processedItems,
      pagination: {
        totalCount: data.response?.body?.totalCount || processedItems.length,
        pageNo: parseInt(pageNo),
        numOfRows: parseInt(numOfRows),
        hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
      },
      syncInfo: {
        showflag: showflag === '1' ? '표출' : '비표출',
        modifiedtime: modifiedtime || 'all'
      }
    },
    metadata: {
      operation: 'areaBasedSyncList',
      searchParams: params,
      performance: {
        searchTime,
        itemCount: processedItems.length
      }
    }
  };
}

// **통합 데이터 조회** (모든 정보를 한번에)
async function handleGetAllData(apiKey, params) {
  const { contentId, includeImages = 'true' } = params;

  if (!contentId) {
    throw new ValidationError('통합 데이터 조회에는 contentId가 필수입니다');
  }

  const startTime = Date.now();

  try {
    // 기본 정보 조회
    const commonResult = await handleDetailCommon(apiKey, { contentId });
    const commonData = commonResult.data;
    const contentTypeId = commonData.contentTypeId;

    // 병렬로 상세 정보들 조회
    const [introResult, infoResult, imageResult, petResult] = await Promise.allSettled([
      handleDetailIntro(apiKey, { contentId, contentTypeId }),
      handleDetailInfo(apiKey, { contentId, contentTypeId }),
      includeImages === 'true' ? handleDetailImage(apiKey, { contentId }) : Promise.resolve(null),
      handleDetailPetTour(apiKey, { contentId }).catch(() => null) // 반려동물 정보는 선택적
    ]);

    const allData = {
      common: commonData,
      intro: introResult.status === 'fulfilled' ? introResult.value.data : null,
      info: infoResult.status === 'fulfilled' ? infoResult.value.data : null,
      images: imageResult.status === 'fulfilled' && imageResult.value ? imageResult.value.data : null,
      petTour: petResult.status === 'fulfilled' && petResult.value ? petResult.value.data : null,
      completeness: calculateCompleteness({
        common: commonData,
        intro: introResult.status === 'fulfilled' ? introResult.value.data : null,
        info: infoResult.status === 'fulfilled' ? infoResult.value.data : null,
        images: imageResult.status === 'fulfilled' && imageResult.value ? imageResult.value.data : null
      })
    };

    const totalTime = Date.now() - startTime;

    return {
      data: allData,
      metadata: {
        operation: 'getAllData',
        contentId,
        contentTypeId,
        typeName: getContentTypeName(contentTypeId),
        performance: {
          totalTime,
          apiCalls: 4 + (includeImages === 'true' ? 1 : 0)
        },
        errors: [
          introResult.status === 'rejected' ? `intro: ${introResult.reason?.message}` : null,
          infoResult.status === 'rejected' ? `info: ${infoResult.reason?.message}` : null,
          imageResult.status === 'rejected' ? `images: ${imageResult.reason?.message}` : null,
          petResult.status === 'rejected' ? `petTour: ${petResult.reason?.message}` : null
        ].filter(Boolean)
      }
    };

  } catch (error) {
    throw new Error(`통합 데이터 조회 실패: ${error.message}`);
  }
}
// utils/tourism-utils.js - TourAPI 4.0 유틸리티 및 설정 모듈

// **상수 정의**
export const SUPPORTED_OPERATIONS = [
  'search', 'areaBasedList', 'locationBasedList', 'searchKeyword',
  'searchFestival', 'searchStay', 'detailCommon', 'detailIntro',
  'detailInfo', 'detailImage', 'detailPetTour', 'areaCode',
  'categoryCode', 'ldongCode', 'lclsSystmCode', 'areaBasedSyncList',
  'getAllData'
];

export const ALLOWED_ORIGINS = [
  'https://yourblog.tistory.com',
  'https://yourblog.github.io',
  'https://yourdomain.com',
  'http://localhost:3000',
  'http://localhost:8080'
];

export const CONTENT_TYPE_NAMES = {
  '12': '관광지',
  '14': '문화시설',
  '15': '축제/공연/행사',
  '25': '여행코스',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점'
};

export const CATEGORY_MAP = {
  'A01': '자연',
  'A02': '인문(문화/예술/역사)',
  'A03': '레포츠',
  'A04': '쇼핑',
  'A05': '음식',
  'B02': '숙박',
  'C01': '추천코스'
};

export const AREA_MAP = {
  '1': '서울',
  '2': '인천',
  '3': '대전',
  '4': '대구',
  '5': '광주',
  '6': '부산',
  '7': '울산',
  '8': '세종',
  '31': '경기',
  '32': '강원',
  '33': '충북',
  '34': '충남',
  '35': '경북',
  '36': '경남',
  '37': '전북',
  '38': '전남',
  '39': '제주'
};

// **커스텀 에러 클래스들**
export class ApiError extends Error {
  constructor(message, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
}

export class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
    this.code = 'SECURITY_ERROR';
  }
}

// **보안 검증 함수**
export function validateSecurityHeaders(req, allowedOrigins) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const userAgent = req.headers['user-agent'];

  // Development 환경에서는 보안 검증 완화
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // 기본적인 봇 차단
  if (!userAgent || userAgent.includes('bot') || userAgent.includes('crawler')) {
    throw new SecurityError('Bot access is not allowed');
  }

  // Origin 또는 Referer 검증
  if (origin) {
    const isAllowedOrigin = allowedOrigins.some(allowed => 
      origin === allowed || origin.endsWith(allowed.replace('https://', ''))
    );
    if (!isAllowedOrigin) {
      throw new SecurityError(`Origin not allowed: ${origin}`);
    }
  } else if (referer) {
    const isAllowedReferer = allowedOrigins.some(allowed => 
      referer.startsWith(allowed)
    );
    if (!isAllowedReferer) {
      throw new SecurityError(`Referer not allowed: ${referer}`);
    }
  } else {
    throw new SecurityError('No valid origin or referer header');
  }

  return true;
}

// **HTTP 요청 함수 (재시도 포함)**
export async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'HealingK-TourAPI/4.3.0',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.warn(`🔄 재시도 ${i + 1}/${maxRetries}:`, error.message);
      
      if (i === maxRetries - 1) {
        throw new ApiError(`API 요청 실패: ${error.message}`, 'FETCH_ERROR');
      }

      // 지수 백오프
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}

// **API 응답 검증**
export function validateApiResponse(data, operation) {
  const resultCode = data.resultCode || data.response?.header?.resultCode;

  if (resultCode !== '0' && resultCode !== '0000') {
    const errorMessage = data.response?.header?.resultMsg || '알 수 없는 오류';
    throw new ApiError(`${operation} API 오류: ${errorMessage}`, resultCode);
  }

  // 데이터 존재 여부 확인 (선택적)
  const hasData = data.response?.body?.items || data.items;
  if (!hasData && operation.includes('search')) {
    console.info(`ℹ️ ${operation}: 검색 결과가 없습니다`);
  }
}

// **아이템 추출 함수들**
export function extractItems(data) {
  const items = data.response?.body?.items?.item || data.items?.item || [];
  return Array.isArray(items) ? items : items ? [items] : [];
}

export function extractSingleItem(data) {
  const items = extractItems(data);
  if (items.length === 0) {
    throw new ApiError('데이터를 찾을 수 없습니다', 'NO_DATA');
  }
  return items[0];
}

// **데이터 처리 함수들**
export function processBasicItem(item) {
  // 좌표 변환 및 검증
  let mapx = null;
  let mapy = null;

  if (item.mapx && item.mapx !== '' && item.mapx !== '0') {
    const parsedX = parseFloat(item.mapx);
    if (!isNaN(parsedX) && parsedX !== 0) {
      mapx = parsedX;
    }
  }

  if (item.mapy && item.mapy !== '' && item.mapy !== '0') {
    const parsedY = parseFloat(item.mapy);
    if (!isNaN(parsedY) && parsedY !== 0) {
      mapy = parsedY;
    }
  }

  return {
    contentId: item.contentid,
    contentTypeId: item.contenttypeid,
    title: item.title,
    addr1: item.addr1 || null,
    addr2: item.addr2 || null,
    tel: item.tel || null,
    firstimage: item.firstimage || null,
    firstimage2: item.firstimage2 || null,
    cpyrhtDivCd: item.cpyrhtDivCd || null,
    mapx: mapx,
    mapy: mapy,
    mlevel: item.mlevel || null,
    areacode: item.areacode || null,
    sigungucode: item.sigungucode || null,
    cat1: item.cat1 || null,
    cat2: item.cat2 || null,
    cat3: item.cat3 || null,
    modifiedtime: item.modifiedtime || null,
    zipcode: item.zipcode || null,
    createdtime: item.createdtime || null,
    // v4.3 신규 필드
    lDongRegnCd: item.lDongRegnCd || null,
    lDongSignguCd: item.lDongSignguCd || null,
    lclsSystm1: item.lclsSystm1 || null,
    lclsSystm2: item.lclsSystm2 || null,
    lclsSystm3: item.lclsSystm3 || null,
    // 메타데이터
    typeName: getContentTypeName(item.contenttypeid),
    categoryInfo: getCategoryInfo(item.cat1, item.cat2, item.cat3),
    areaInfo: getAreaInfo(item.areacode, item.sigungucode)
  };
}

export async function processBasicItems(items, userLat, userLng, radius) {
  let processedItems = items.map(item => processBasicItem(item));

  // 거리 계산
  const hasUserLocation = userLat && userLng && 
    userLat.trim() !== '' && userLng.trim() !== '' && 
    !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng));

  if (hasUserLocation) {
    const userLatNum = parseFloat(userLat);
    const userLngNum = parseFloat(userLng);
    const radiusKm = radius && !isNaN(parseFloat(radius)) ? parseFloat(radius) : null;

    processedItems = processedItems.map(item => {
      if (item.mapx && item.mapy) {
        const distance = calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
        return {
          ...item,
          distance: distance !== null ? Math.round(distance * 100) / 100 : null
        };
      }
      return { ...item, distance: null };
    });

    // 반경 필터링
    if (radiusKm && radiusKm > 0) {
      const itemsWithDistance = processedItems.filter(item => 
        item.distance !== null && item.distance <= radiusKm
      );
      if (itemsWithDistance.length > 0) {
        processedItems = itemsWithDistance;
      }
    }

    // 거리순 정렬
    processedItems.sort((a, b) => {
      const distA = a.distance !== null ? a.distance : 999999;
      const distB = b.distance !== null ? b.distance : 999999;
      return distA - distB;
    });
  }

  return processedItems;
}

// **상세 정보 추가**
export async function addDetailedInfo(apiKey, items, options = {}) {
  const { includeImages = false, maxItems = 5 } = options;
  const detailedItems = items.slice(0, maxItems);

  const detailedPromises = detailedItems.map(async (item) => {
    try {
      const detailPromises = [
        fetchDetailCommon(apiKey, item.contentId),
        fetchDetailIntro(apiKey, item.contentId, item.contentTypeId)
      ];

      if (includeImages) {
        detailPromises.push(
          fetchDetailImage(apiKey, item.contentId).catch(() => null)
        );
      }

      const results = await Promise.allSettled(detailPromises);

      const detailed = {
        common: results[0].status === 'fulfilled' ? results[0].value : null,
        intro: results[1].status === 'fulfilled' ? results[1].value : null,
        images: includeImages && results[2] && results[2].status === 'fulfilled' ? results[2].value : null,
        completeness: 50, // 기본값
        hasError: results.some(r => r.status === 'rejected')
      };

      // Overview가 있으면 업데이트
      if (detailed.common?.overview && !item.overview) {
        item.overview = detailed.common.overview;
      }

      detailed.completeness = calculateCompleteness(detailed);

      return { ...item, detailed };
    } catch (error) {
      return {
        ...item,
        detailed: {
          error: error.message,
          completeness: 20,
          hasError: true
        }
      };
    }
  });

  const detailedResults = await Promise.all(detailedPromises);
  return [...detailedResults, ...items.slice(maxItems)];
}

// **상세정보 개별 조회 함수들**
async function fetchDetailCommon(apiKey, contentId) {
  const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  validateApiResponse(data, 'detailCommon');
  return extractSingleItem(data);
}

async function fetchDetailIntro(apiKey, contentId, contentTypeId) {
  const url = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  validateApiResponse(data, 'detailIntro');
  return extractSingleItem(data);
}

async function fetchDetailImage(apiKey, contentId) {
  const url = `https://apis.data.go.kr/B551011/KorService2/detailImage2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&imageYN=Y`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  validateApiResponse(data, 'detailImage');
  return extractItems(data);
}

// **상세 소개정보 처리 (매뉴얼 v4.3 완벽 대응)**
export function processDetailIntroItem(contentTypeId, item) {
  const baseInfo = {
    contentId: item.contentid,
    contentTypeId: item.contenttypeid,
    typeName: getContentTypeName(contentTypeId)
  };

  // 타입별 상세 정보 매핑 (매뉴얼 p.47-53 기준)
  switch (contentTypeId) {
    case '12': // 관광지
      return {
        ...baseInfo,
        accomcount: item.accomcount || null,
        chkbabycarriage: item.chkbabycarriage || null,
        chkcreditcard: item.chkcreditcard || null,
        chkpet: item.chkpet || null,
        expagerange: item.expagerange || null,
        expguide: item.expguide || null,
        heritage1: item.heritage1 || null,
        heritage2: item.heritage2 || null,
        heritage3: item.heritage3 || null,
        infocenter: item.infocenter || null,
        opendate: item.opendate || null,
        parking: item.parking || null,
        restdate: item.restdate || null,
        useseason: item.useseason || null,
        usetime: item.usetime || null
      };

    case '14': // 문화시설
      return {
        ...baseInfo,
        accomcountculture: item.accomcountculture || null,
        chkbabycarriageculture: item.chkbabycarriageculture || null,
        chkcreditcardculture: item.chkcreditcardculture || null,
        chkpetculture: item.chkpetculture || null,
        discountinfo: item.discountinfo || null,
        infocenterculture: item.infocenterculture || null,
        parkingculture: item.parkingculture || null,
        parkingfee: item.parkingfee || null,
        restdateculture: item.restdateculture || null,
        usefee: item.usefee || null,
        usetimeculture: item.usetimeculture || null,
        scale: item.scale || null,
        spendtime: item.spendtime || null
      };

    case '15': // 행사/공연/축제
      return {
        ...baseInfo,
        agelimit: item.agelimit || null,
        bookingplace: item.bookingplace || null,
        discountinfofestival: item.discountinfofestival || null,
        eventenddate: item.eventenddate || null,
        eventhomepage: item.eventhomepage || null,
        eventplace: item.eventplace || null,
        eventstartdate: item.eventstartdate || null,
        festivalgrade: item.festivalgrade || null,
        placeinfo: item.placeinfo || null,
        playtime: item.playtime || null,
        program: item.program || null,
        spendtimefestival: item.spendtimefestival || null,
        sponsor1: item.sponsor1 || null,
        sponsor1tel: item.sponsor1tel || null,
        sponsor2: item.sponsor2 || null,
        sponsor2tel: item.sponsor2tel || null,
        subevent: item.subevent || null,
        usetimefestival: item.usetimefestival || null
      };

    case '25': // 여행코스
      return {
        ...baseInfo,
        distance: item.distance || null,
        infocentertourcourse: item.infocentertourcourse || null,
        schedule: item.schedule || null,
        taketime: item.taketime || null,
        theme: item.theme || null
      };

    case '28': // 레포츠
      return {
        ...baseInfo,
        accomcountleports: item.accomcountleports || null,
        chkbabycarriageleports: item.chkbabycarriageleports || null,
        chkcreditcardleports: item.chkcreditcardleports || null,
        chkpetleports: item.chkpetleports || null,
        expagerangeleports: item.expagerangeleports || null,
        infocenterleports: item.infocenterleports || null,
        openperiod: item.openperiod || null,
        parkingfeeleports: item.parkingfeeleports || null,
        parkingleports: item.parkingleports || null,
        reservation: item.reservation || null,
        restdateleports: item.restdateleports || null,
        scaleleports: item.scaleleports || null,
        usefeeleports: item.usefeeleports || null,
        usetimeleports: item.usetimeleports || null
      };

    case '32': // 숙박
      return {
        ...baseInfo,
        accomcountlodging: item.accomcountlodging || null,
        checkintime: item.checkintime || null,
        checkouttime: item.checkouttime || null,
        chkcooking: item.chkcooking || null,
        foodplace: item.foodplace || null,
        infocenterlodging: item.infocenterlodging || null,
        parkinglodging: item.parkinglodging || null,
        pickup: item.pickup || null,
        roomcount: item.roomcount || null,
        reservationlodging: item.reservationlodging || null,
        reservationurl: item.reservationurl || null,
        roomtype: item.roomtype || null,
        scalelodging: item.scalelodging || null,
        subfacility: item.subfacility || null,
        // 부대시설 정보
        barbecue: item.barbecue || null,
        beauty: item.beauty || null,
        beverage: item.beverage || null,
        bicycle: item.bicycle || null,
        campfire: item.campfire || null,
        fitness: item.fitness || null,
        karaoke: item.karaoke || null,
        publicbath: item.publicbath || null,
        publicpc: item.publicpc || null,
        sauna: item.sauna || null,
        seminar: item.seminar || null,
        sports: item.sports || null,
        refundregulation: item.refundregulation || null
      };

    case '38': // 쇼핑
      return {
        ...baseInfo,
        chkbabycarriageshopping: item.chkbabycarriageshopping || null,
        chkcreditcardshopping: item.chkcreditcardshopping || null,
        chkpetshopping: item.chkpetshopping || null,
        culturecenter: item.culturecenter || null,
        fairday: item.fairday || null,
        infocentershopping: item.infocentershopping || null,
        opendateshopping: item.opendateshopping || null,
        opentime: item.opentime || null,
        parkingshopping: item.parkingshopping || null,
        restdateshopping: item.restdateshopping || null,
        restroom: item.restroom || null,
        saleitem: item.saleitem || null,
        saleitemcost: item.saleitemcost || null,
        scaleshopping: item.scaleshopping || null,
        shopguide: item.shopguide || null
      };

    case '39': // 음식점
      return {
        ...baseInfo,
        chkcreditcardfood: item.chkcreditcardfood || null,
        discountinfofood: item.discountinfofood || null,
        firstmenu: item.firstmenu || null,
        infocenterfood: item.infocenterfood || null,
        kidsfacility: item.kidsfacility || null,
        lcnsno: item.lcnsno || null, // v4.3 신규 - 인허가번호
        opendatefood: item.opendatefood || null,
        opentimefood: item.opentimefood || null,
        packing: item.packing || null,
        parkingfood: item.parkingfood || null,
        reservationfood: item.reservationfood || null,
        restdatefood: item.restdatefood || null,
        scalefood: item.scalefood || null,
        seat: item.seat || null,
        smoking: item.smoking || null,
        treatmenu: item.treatmenu || null
      };

    default:
      return baseInfo;
  }
}

// **반복정보 처리 (매뉴얼 p.54-60 기준)**
export function processDetailInfoItem(contentTypeId, item) {
  const baseInfo = {
    contentId: item.contentid,
    contentTypeId: item.contenttypeid
  };

  if (contentTypeId === '32') { // 숙박 - 객실정보
    return {
      ...baseInfo,
      type: 'room',
      roomcode: item.roomcode || null,
      roomtitle: item.roomtitle || null,
      roomsize1: item.roomsize1 || null,
      roomsize2: item.roomsize2 || null,
      roomcount: item.roomcount || null,
      roombasecount: item.roombasecount || null,
      roommaxcount: item.roommaxcount || null,
      roomoffseasonminfee1: item.roomoffseasonminfee1 || null,
      roomoffseasonminfee2: item.roomoffseasonminfee2 || null,
      roompeakseasonminfee1: item.roompeakseasonminfee1 || null,
      roompeakseasonminfee2: item.roompeakseasonminfee2 || null,
      roomintro: item.roomintro || null,
      // 객실 시설
      roombathfacility: item.roombathfacility || null,
      roombath: item.roombath || null,
      roomhometheater: item.roomhometheater || null,
      roomaircondition: item.roomaircondition || null,
      roomtv: item.roomtv || null,
      roompc: item.roompc || null,
      roomcable: item.roomcable || null,
      roominternet: item.roominternet || null,
      roomrefrigerator: item.roomrefrigerator || null,
      roomtoiletries: item.roomtoiletries || null,
      roomsofa: item.roomsofa || null,
      roomcook: item.roomcook || null,
      roomtable: item.roomtable || null,
      roomhairdryer: item.roomhairdryer || null,
      // 객실 이미지
      roomimg1: item.roomimg1 || null,
      roomimg1alt: item.roomimg1alt || null,
      cpyrhtDivCd1: item.cpyrhtDivCd1 || null,
      roomimg2: item.roomimg2 || null,
      roomimg2alt: item.roomimg2alt || null,
      cpyrhtDivCd2: item.cpyrhtDivCd2 || null,
      roomimg3: item.roomimg3 || null,
      roomimg3alt: item.roomimg3alt || null,
      cpyrhtDivCd3: item.cpyrhtDivCd3 || null,
      roomimg4: item.roomimg4 || null,
      roomimg4alt: item.roomimg4alt || null,
      cpyrhtDivCd4: item.cpyrhtDivCd4 || null,
      roomimg5: item.roomimg5 || null,
      roomimg5alt: item.roomimg5alt || null,
      cpyrhtDivCd5: item.cpyrhtDivCd5 || null
    };
  } else if (contentTypeId === '25') { // 여행코스 - 코스정보
    return {
      ...baseInfo,
      type: 'course',
      subcontentid: item.subcontentid || null,
      subname: item.subname || null,
      subdetailoverview: item.subdetailoverview || null,
      subdetailimg: item.subdetailimg || null,
      subdetailalt: item.subdetailalt || null,
      subnum: item.subnum || null
    };
  } else { // 기타 - 일반 반복정보
    return {
      ...baseInfo,
      type: 'general',
      fldgubun: item.fldgubun || null,
      infoname: item.infoname || null,
      infotext: item.infotext || null,
      serialnum: item.serialnum || null
    };
  }
}

// **거리 계산 함수 (Haversine formula)**
export function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    const latitude1 = Number(lat1);
    const longitude1 = Number(lon1);
    const latitude2 = Number(lat2);
    const longitude2 = Number(lon2);

    if (isNaN(latitude1) || isNaN(longitude1) || isNaN(latitude2) || isNaN(longitude2)) {
      return null;
    }

    if (latitude1 < -90 || latitude1 > 90 || latitude2 < -90 || latitude2 > 90) {
      return null;
    }

    if (longitude1 < -180 || longitude1 > 180 || longitude2 < -180 || longitude2 > 180) {
      return null;
    }

    const R = 6371; // 지구 반지름 (km)
    const dLat = (latitude2 - latitude1) * Math.PI / 180;
    const dLon = (longitude2 - longitude1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(latitude1 * Math.PI / 180) * Math.cos(latitude2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    if (isNaN(distance) || distance < 0 || distance > 20000) {
      return null;
    }

    return distance;
  } catch (error) {
    return null;
  }
}

// **완성도 계산**
export function calculateCompleteness(data) {
  let score = 20; // 기본 점수

  if (data.common) {
    if (data.common.overview) score += 25;
    if (data.common.tel) score += 15;
    if (data.common.homepage) score += 10;
    if (data.common.usetime) score += 10;
    if (data.common.parking) score += 5;
    if (data.common.usefee) score += 5;
  }

  if (data.intro) {
    score += 10;
  }

  if (data.info && Array.isArray(data.info) && data.info.length > 0) {
    score += 5;
  }

  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    score += 5;
  }

  return Math.min(score, 100);
}

// **메타데이터 생성 함수들**
export function getContentTypeName(contentTypeId) {
  return CONTENT_TYPE_NAMES[contentTypeId] || '기타';
}

export function getCategoryInfo(cat1, cat2, cat3) {
  return {
    main: CATEGORY_MAP[cat1] || '기타',
    cat1, cat2, cat3
  };
}

export function getAreaInfo(areaCode, sigunguCode) {
  return {
    area: AREA_MAP[areaCode] || '기타',
    areaCode,
    sigunguCode
  };
}
